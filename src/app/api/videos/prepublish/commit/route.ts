import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getBucketName, getS3Client } from "@/utils/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { invalidateNeriaContextCache } from "@/utils/neria-context";

async function uploadToGeminiFromS3(params: { body: any; mime: string; sizeBytes?: number; fileName?: string; }): Promise<{ name: string; uri: string; }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}&uploadType=media`;
  const headers: Record<string, string> = {
    "Content-Type": params.mime,
    "X-Goog-Upload-Protocol": "raw",
  };
  if (params.sizeBytes != null) headers["X-Goog-Upload-Header-Content-Length"] = String(params.sizeBytes);
  if (params.fileName) headers["X-Goog-Upload-File-Name"] = params.fileName;
  const res = await fetch(uploadUrl, { 
    method: "POST", 
    headers, 
    body: params.body as any,
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
  
  console.log(`[Prepublish] Gemini file uploaded: ${name}, polling for ACTIVE state...`);
  
  // Poll until ACTIVE - large videos can take several minutes
  let isActive = false;
  let lastState = "";
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, i < 5 ? 1000 : 3000));
    const pollUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/${name}`);
    pollUrl.searchParams.set("key", apiKey);
    const s = await fetch(pollUrl.toString(), { cache: 'no-store' });
    if (!s.ok) {
      console.log(`[Prepublish] Poll ${i}: HTTP ${s.status}`);
      continue;
    }
    const sj = await s.json().catch(() => ({}));
    const state = sj?.file?.state || sj?.state || "";
    if (state !== lastState) {
      console.log(`[Prepublish] Poll ${i}: state changed to ${state}`);
      lastState = state;
    }
    if (state === "ACTIVE") {
      isActive = true;
      console.log(`[Prepublish] File ${name} is ACTIVE after ${i} polls`);
      break;
    }
    if (state === "PROCESSING") {
      // Still processing, continue polling
      continue;
    }
    if (state && ["FAILED", "DELETING"].includes(state)) {
      throw new Error(`Gemini file state ${state}`);
    }
  }
  
  if (!isActive) {
    console.error(`[Prepublish] File ${name} never reached ACTIVE state. Last state: ${lastState}`);
    throw new Error(`Gemini file did not reach ACTIVE state after upload (last state: ${lastState || 'unknown'})`);
  }
  return { name, uri };
}

async function callGeminiAnalyze({ fileUri, mime }: { fileUri: string; mime: string; }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent";

  const responseSchema = {
    type: "object",
    properties: {
      scores: {
        type: "object",
        properties: {
          hook_strength: { type: "number" },
          pacing: { type: "number" },
          energy: { type: "number" },
          visual_engagement: { type: "number" },
        },
        required: ["hook_strength", "pacing", "energy", "visual_engagement"],
      },
      metrics: {
        type: "object",
        properties: {
          words_per_minute: { type: "number" },
          cuts_per_minute: { type: "number" },
          average_shot_length_sec: { type: "number" },
          slow_start_sec: { type: "number" },
          pause_segments: {
            type: "array",
            items: { type: "object", properties: { start: { type: "number" }, end: { type: "number" } }, required: ["start", "end"] },
          },
        },
      },
      flat_spots: {
        type: "array",
        items: { type: "object", properties: { start: { type: "number" }, end: { type: "number" }, reason: { type: "string" } }, required: ["start", "end"] },
      },
      moments: {
        type: "array",
        items: { type: "object", properties: { time: { type: "number" }, caption: { type: "string" } }, required: ["time", "caption"] },
      },
      transcript: {
        type: "array",
        items: { type: "object", properties: { start: { type: "number" }, end: { type: "number" }, text: { type: "string" } }, required: ["start", "text"] },
      },
      summary: { type: "string" },
    },
    required: ["scores"],
  } as const;

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
    contents: [
      { role: "user", parts: [
        { text: instruction },
        { fileData: { fileUri: fileUri, mimeType: mime } }
      ]}
    ],
    generationConfig: {
      temperature: 0,
      response_mime_type: "application/json",
      response_schema: responseSchema,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(url + `?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini analyze error: ${res.status} ${txt}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("") || "";
  let parsed: any;
  try {
    const stripped = String(text).replace(/^```json\n?/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(stripped || text);
  } catch (e) {
    throw new Error("Gemini returned non-JSON content");
  }
  return parsed;
}

// POST /api/videos/prepublish/commit { channelId, planId?, key, mime, sizeBytes? }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { channelId, planId, videoId, key, mime, sizeBytes } = body as {
      channelId?: string;
      planId?: string;
      videoId?: string;
      key?: string;
      mime?: string;
      sizeBytes?: number;
    };
    if (!channelId || !key || !mime) {
      return NextResponse.json({ error: "channelId, key, mime required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Resolve channel UUID
    const { data: ch } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ch) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    // Determine version per plan or video
    let version = 1;
    try {
      let query = supabase
        .from("prepublish_videos")
        .select("version")
        .eq("user_id", user.id)
        .eq("channel_id", ch.id);
      
      if (planId) query = query.eq("plan_id", planId);
      else if (videoId) query = query.eq("video_id", videoId);
      
      const { data: rows } = await query
        .order("uploaded_at", { ascending: false })
        .limit(1);
      if (rows && rows[0]?.version) version = Number(rows[0].version) + 1;
    } catch {}

    const admin = createSupabaseAdminClient();
    const insert = await admin
      .from("prepublish_videos")
      .insert({
        user_id: user.id,
        channel_id: ch.id,
        plan_id: planId || null,
        video_id: videoId || null,
        version,
        mime,
        size_bytes: sizeBytes ?? null,
        s3_key: key,
        status: "queued",
      })
      .select("id")
      .single();

    if (insert.error) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    const preId = insert.data.id as string;

    // Start background analysis (do not await)
    (async () => {
      const s3 = getS3Client();
      const Bucket = getBucketName();
      const apiKey = process.env.GEMINI_API_KEY;
      try {
        console.log(`[Prepublish:commit] Starting background analysis for ${preId}, S3 key: ${key}`);
        
        console.log(`[Prepublish:commit] Fetching from S3...`);
        const getCmd = new GetObjectCommand({ Bucket, Key: key });
        const obj = await s3.send(getCmd);
        console.log(`[Prepublish:commit] S3 fetch successful, content length: ${obj.ContentLength || 'unknown'}`);
        
        // @ts-ignore
        const bodyStream = obj.Body as any;
        
        console.log(`[Prepublish:commit] Uploading to Gemini...`);
        const uploaded = await uploadToGeminiFromS3({ body: bodyStream, mime, sizeBytes, fileName: key.split('/').pop() || 'video' });
        console.log(`[Prepublish:commit] Gemini upload successful: ${uploaded.name}`);
        
        console.log(`[Prepublish:commit] Running Gemini analysis...`);
        const analysis = await callGeminiAnalyze({ fileUri: uploaded.uri, mime });
        console.log(`[Prepublish:commit] Gemini analysis complete`);

        // Save analysis
        console.log(`[Prepublish:commit] Saving analysis to database...`);
        await admin
          .from("prepublish_analyses")
          .insert({ prepublish_video_id: preId, model: "gemini-2.5-pro", summary: analysis?.summary || null, analysis_json: analysis || {}, transcript_json: analysis?.transcript || null });

        await admin
          .from("prepublish_videos")
          .update({ status: "ready", analyzed_at: new Date().toISOString() })
          .eq("id", preId);
        
        console.log(`[Prepublish:commit] Analysis saved successfully`);
        
        // Get internal channel ID to invalidate Neria context cache
        const { data: videoData } = await admin
          .from("prepublish_videos")
          .select("channel_id")
          .eq("id", preId)
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
        // Best-effort cleanup of remote Gemini file to reduce footprint
        if (apiKey) {
          try {
            const deleteUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/${uploaded.name}`);
            deleteUrl.searchParams.set("key", apiKey);
            await fetch(deleteUrl.toString(), { method: 'DELETE' });
          } catch {}
        }
      } catch (err: any) {
        console.error(`[Prepublish:commit] ERROR during background analysis:`, err);
        console.error(`[Prepublish:commit] Error name: ${err?.name}`);
        console.error(`[Prepublish:commit] Error message: ${err?.message}`);
        console.error(`[Prepublish:commit] Error stack:`, err?.stack);
        
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        await admin
          .from("prepublish_videos")
          .update({ status: "error", error: errorMessage })
          .eq("id", preId);
      }
    })();

    return NextResponse.json({ id: preId, status: "queued" });
  } catch (e) {
    console.error("[prepublish:commit] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


