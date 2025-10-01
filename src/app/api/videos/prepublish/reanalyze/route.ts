import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getS3Client, getBucketName } from "@/utils/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { invalidateNeriaContextCache } from "@/utils/neria-context";

// Helper to read stream to buffer
async function readStreamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function uploadToGemini({ body, mime, sizeBytes, fileName }: { body: Buffer; mime: string; sizeBytes?: number; fileName?: string; }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}&uploadType=media`;

  const headers: Record<string, string> = {
    "Content-Type": mime,
    "X-Goog-Upload-Protocol": "raw",
  };
  if (sizeBytes != null) headers["X-Goog-Upload-Header-Content-Length"] = String(sizeBytes);
  if (fileName) headers["X-Goog-Upload-File-Name"] = fileName;

  const res = await fetch(uploadUrl, { 
    method: "POST", 
    headers, 
    body,
    // @ts-ignore - duplex is required for streaming uploads in Node.js fetch
    duplex: 'half'
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini upload error: ${res.status} ${txt}`);
  }

  const j = await res.json();
  const name = j?.file?.name || j?.name || "";
  const uri = j?.file?.uri || j?.uri || "";
  if (!name || !uri) throw new Error("Invalid upload response from Gemini");

  // Poll until ACTIVE
  let isActive = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, i < 3 ? 500 : 2000));
    const pollUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/${name}`);
    pollUrl.searchParams.set("key", apiKey);
      const s = await fetch(pollUrl, { cache: 'no-store' });
    if (!s.ok) continue;
    const sj = await s.json().catch(() => ({}));
    const state = sj?.file?.state || sj?.state || "";
    if (state === "ACTIVE") {
      isActive = true;
      break;
    }
    if (state && ["FAILED", "DELETING"].includes(state)) throw new Error(`Gemini file state ${state}`);
  }

  if (!isActive) throw new Error("Gemini file did not reach ACTIVE state after upload");

  return { name, uri };
}

async function analyzeWithGemini({ fileUri, mime }: { fileUri: string; mime: string; }) {
  const apiKey = process.env.GEMINI_API_KEY!;
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent";
  
  const instruction = `Analyze this YouTube-style video for pre-publish coaching.
Return compact JSON only (no prose) with:
- scores (0-10): hook_strength, pacing, energy, visual_engagement
- metrics: words_per_minute, cuts_per_minute, average_shot_length_sec, slow_start_sec, pause_segments[]
- flat_spots[]: timestamp ranges likely to lose viewers with a short reason. IMPORTANT: start and end must be in TOTAL SECONDS from video start (e.g., 65 for 1:05, 245 for 4:05), NOT minutes or mm:ss format.
- moments[]: Identify ALL significant highlight moments throughout the ENTIRE video duration with suggested lower-third captions. CRITICAL REQUIREMENT: You MUST analyze and identify moments from the BEGINNING, MIDDLE, and END of the video. Time values must be in TOTAL SECONDS from video start. For a 7-minute video, you should have moments spanning from 0 seconds to 420 seconds. For a 10-minute video, moments should span 0-600 seconds. Identify every content shift, demonstration, reveal, problem solution, visual change, or teaching point throughout the full timeline. Do not cluster all moments at the beginning - ensure even distribution across the entire video length.
- transcript[]: coarse transcript segments. IMPORTANT: start and end must be in TOTAL SECONDS from video start.
- summary: one-paragraph summary of the main improvement areas.
`;
  
  const body = {
    contents: [{ role: 'user', parts: [
      { text: instruction },
      { fileData: { fileUri, mimeType: mime } }
    ]}],
    generationConfig: { response_mime_type: 'application/json', maxOutputTokens: 8192, temperature: 0 }
  };
  const res = await fetch(url + `?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini analyze error: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || '';
  const stripped = text.replace(/^```json\n?/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(stripped || text || '{}');
}

// POST /api/videos/prepublish/reanalyze { prepublishVideoId }
export async function POST(request: Request) {
  try {
    const { prepublishVideoId, planId, videoId } = await request.json();
    if (!prepublishVideoId && !planId && !videoId) return NextResponse.json({ error: 'prepublishVideoId, planId, or videoId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Resolve target prepublish row by id or latest for plan/video
    let targetId = prepublishVideoId as string | undefined;
    if (!targetId && (planId || videoId)) {
      let query = supabase
        .from('prepublish_videos')
        .select('id')
        .eq('user_id', user.id);
      
      if (planId) query = query.eq('plan_id', planId);
      else if (videoId) query = query.eq('video_id', videoId);
      
      const { data: latest } = await query
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetId = latest?.id;
    }
    if (!targetId) return NextResponse.json({ error: 'No prior upload found' }, { status: 404 });
    const { data: row } = await supabase
      .from('prepublish_videos')
      .select('id, s3_key, mime')
      .eq('id', targetId)
      .eq('user_id', user.id)  // Add user_id filter for RLS
      .maybeSingle();
    if (!row?.s3_key) return NextResponse.json({ error: 's3 object not stored for this upload' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    await admin.from('prepublish_videos').update({ status: 'analyzing', error: null }).eq('id', targetId);

    // Stream existing S3 object to Gemini
    (async () => {
      const s3 = getS3Client();
      const Bucket = getBucketName();
      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket, Key: row.s3_key }));
        if (!obj.Body) throw new Error("S3 object body is empty");
        
        // Convert stream to buffer
        const buffer = await readStreamToBuffer(obj.Body);
        
        const uploaded = await uploadToGemini({ body: buffer, mime: row.mime, sizeBytes: buffer.length, fileName: row.s3_key.split('/').pop() || 'video' });
        const analysis = await analyzeWithGemini({ fileUri: uploaded.uri, mime: row.mime });
        await admin.from('prepublish_analyses').insert({ prepublish_video_id: targetId, model: 'gemini-2.5-pro', summary: analysis?.summary || null, analysis_json: analysis || {}, transcript_json: analysis?.transcript || null });
        await admin.from('prepublish_videos').update({ status: 'ready', analyzed_at: new Date().toISOString() }).eq('id', targetId);
        
        // Invalidate Neria context cache so analysis is available immediately
        const { data: videoData } = await admin
          .from("prepublish_videos")
          .select("channel_id")
          .eq("id", targetId)
          .maybeSingle();
        
        if (videoData?.channel_id) {
          // Get internal channel ID from external channel_id
          const { data: channelRow } = await admin
            .from("channels")
            .select("id")
            .eq("channel_id", videoData.channel_id)
            .maybeSingle();
          
          if (channelRow?.id) {
            await invalidateNeriaContextCache(channelRow.id);
          }
        }
      } catch (e: any) {
        await admin.from('prepublish_videos').update({ status: 'error', error: String(e?.message || e) }).eq('id', targetId);
      }
    })();

    return NextResponse.json({ ok: true, prepublishVideoId: targetId });
  } catch (e) {
    console.error('[prepublish:reanalyze] error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


