import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getBucketName, getS3Client } from "@/utils/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";

async function uploadToGeminiFromS3(params: { body: any; mime: string; sizeBytes?: number; fileName?: string; }): Promise<{ name: string; uri: string; }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const uploadUrl = `https://generativelanguage.googleapis.com/v1beta/files:upload?key=${encodeURIComponent(apiKey)}`;
  const headers: Record<string, string> = {
    "Content-Type": params.mime,
    "X-Goog-Upload-Protocol": "raw",
  };
  if (params.sizeBytes != null) headers["X-Goog-Upload-Header-Content-Length"] = String(params.sizeBytes);
  if (params.fileName) headers["X-Goog-Upload-File-Name"] = params.fileName;
  const res = await fetch(uploadUrl, { method: "POST", headers, body: params.body as any });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini upload error: ${res.status} ${txt}`);
  }
  const j = await res.json();
  const name = j?.file?.name || j?.name || "";
  const uri = j?.file?.uri || j?.uri || "";
  if (!name || !uri) throw new Error("Invalid upload response from Gemini");
  // Poll until ACTIVE
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, i < 3 ? 500 : 1500));
    const s = await fetch(`https://generativelanguage.googleapis.com/v1beta/${encodeURIComponent(name)}?key=${encodeURIComponent(apiKey)}`);
    const sj = await s.json().catch(() => ({}));
    const state = sj?.file?.state || sj?.state || "";
    if (state === "ACTIVE") break;
    if (state && ["FAILED", "DELETING"].includes(state)) throw new Error(`Gemini file state ${state}`);
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
- flat_spots[]: timestamp ranges likely to lose viewers with a short reason
- moments[]: 3-7 highlight moments with suggested lower-third captions
- transcript[]: coarse transcript segments with start/end seconds
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
      temperature: 0.4,
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
    const { channelId, planId, key, mime, sizeBytes } = body as {
      channelId?: string;
      planId?: string;
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

    // Determine version per plan
    let version = 1;
    try {
      const { data: rows } = await supabase
        .from("prepublish_videos")
        .select("version")
        .eq("user_id", user.id)
        .eq("channel_id", ch.id)
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
      try {
        const getCmd = new GetObjectCommand({ Bucket, Key: key });
        const obj = await s3.send(getCmd);
        // @ts-ignore
        const bodyStream = obj.Body as any;
        const uploaded = await uploadToGeminiFromS3({ body: bodyStream, mime, sizeBytes, fileName: key.split('/').pop() || 'video' });
        const analysis = await callGeminiAnalyze({ fileUri: uploaded.uri, mime });

        // Save analysis
        await admin
          .from("prepublish_analyses")
          .insert({ prepublish_video_id: preId, model: "gemini-2.5-pro", summary: analysis?.summary || null, analysis_json: analysis || {}, transcript_json: analysis?.transcript || null });

        await admin
          .from("prepublish_videos")
          .update({ status: "ready", analyzed_at: new Date().toISOString() })
          .eq("id", preId);
        // Best-effort cleanup of remote Gemini file to reduce footprint
        try {
          await fetch(`https://generativelanguage.googleapis.com/v1beta/${encodeURIComponent(uploaded.name)}?key=${encodeURIComponent(apiKey)}`, { method: 'DELETE' });
        } catch {}
      } catch (err: any) {
        await admin
          .from("prepublish_videos")
          .update({ status: "error", error: String(err?.message || err) })
          .eq("id", preId);
      }
    })();

    return NextResponse.json({ id: preId, status: "queued" });
  } catch (e) {
    console.error("[prepublish:commit] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


