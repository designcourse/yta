import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getValidAccessToken } from "@/utils/googleAuth";
import { getClient } from "@/utils/openai";

function parseISODurationToSeconds(iso: string): number {
  // PT#H#M#S
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!match) return 0;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  return h * 3600 + m * 60 + s;
}

function parseVtt(vtt: string) {
  // Very small VTT parser returning [{start,end,text}]
  const lines = vtt.split(/\r?\n/);
  const cues: Array<{ start: number; end: number; text: string }> = [];
  const toSec = (t: string) => {
    const m = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(t) || /(\d{2}):(\d{2})\.(\d{3})/.exec(t);
    if (!m) return 0;
    if (m.length === 5) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 1000;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("-->>") || line.includes("-->")) {
      const [a, b] = line.split(/-->>|-->/).map(s => s.trim());
      const start = toSec(a);
      const end = toSec(b);
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }
      const text = textLines.join(" ").replace(/<[^>]+>/g, "").trim();
      if (text) cues.push({ start, end, text });
    }
  }
  return cues;
}

function cleanCaptionText(text: string) {
  let t = text || '';
  // Remove bracketed non-speech markers like [Music], [संगीत], [Applause], etc.
  t = t.replace(/\[[^\]]+\]/g, ' ');
  // Collapse repeated single words (e.g., "Concepts Concepts Concepts")
  t = t.replace(/\b(\w[\w'’\-]*)\b(\s+\1\b)+/gi, '$1');
  // Collapse repeated short phrases up to 3 words
  t = t.replace(/\b([\w'’\-]+\s+[\w'’\-]+)\b(\s+\1\b)+/gi, '$1');
  t = t.replace(/\b([\w'’\-]+\s+[\w'’\-]+\s+[\w'’\-]+)\b(\s+\1\b)+/gi, '$1');
  // Normalize whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function parseTrackList(xml: string) {
  // Returns array of {lang, kind?, name?}
  const tracks: Array<{ lang: string; kind?: string; name?: string }> = [];
  const trackTags = xml.match(/<track\b[^>]*>/g) || [];
  for (const tag of trackTags) {
    const attrs: Record<string, string> = {} as any;
    for (const m of tag.matchAll(/(\w+)="([^"]*)"/g) as any) {
      attrs[m[1]] = m[2];
    }
    const lang = attrs["lang_code"] || attrs["lang_original"] || attrs["lang"];
    if (lang) tracks.push({ lang, kind: attrs["kind"], name: attrs["name"] });
  }
  return tracks;
}

async function fetchTimedtextByTrack(videoId: string, track: { lang: string; kind?: string; name?: string }) {
  const base = `https://www.youtube.com/api/timedtext`;
  const params = new URLSearchParams({ v: videoId, lang: track.lang, fmt: 'vtt' });
  if (track.kind) params.set('kind', track.kind);
  if (track.name) params.set('name', track.name);
  let res = await fetch(`${base}?${params.toString()}`);
  if (res.ok) {
    const vtt = await res.text();
    const cues = parseVtt(vtt);
    if (cues.length > 0) return cues;
  }
  // Try srv3 XML
  const p2 = new URLSearchParams({ v: videoId, lang: track.lang, fmt: 'srv3' });
  if (track.kind) p2.set('kind', track.kind);
  if (track.name) p2.set('name', track.name);
  res = await fetch(`${base}?${p2.toString()}`);
  if (res.ok) {
    const xml = await res.text();
    // Parse <text start=".." dur="..">content</text>
    const cues: Array<{ start: number; end: number; text: string }> = [];
    const texts = xml.match(/<text\b[^>]*>([\s\S]*?)<\/text>/g) || [];
    for (const t of texts) {
      const startMatch = t.match(/start="([^"]+)"/);
      const durMatch = t.match(/dur="([^"]+)"/);
      const content = (t.replace(/<text\b[^>]*>/, '').replace(/<\/text>/, '') || '').replace(/\n/g, ' ');
      const start = startMatch ? Number(startMatch[1]) : 0;
      const end = start + (durMatch ? Number(durMatch[1]) : 0);
      const text = content.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      if (text.trim()) cues.push({ start, end, text });
    }
    if (cues.length > 0) return cues;
  }
  return [] as Array<{ start: number; end: number; text: string }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const overrideVideoId = searchParams.get('videoId');
    if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Resolve internal channel
    const { data: channelRow } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();
    if (!channelRow) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();
    // Load latest video snapshot (or override with selected video)
    let snap: any;
    if (overrideVideoId) {
      // Fetch basic info to label title/published
      const token = await getValidAccessToken(user.id, channelId);
      if (!token.success) return NextResponse.json({ error: token.error || 'No YouTube access' }, { status: 400 });
      const vres = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${overrideVideoId}`, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });
      const vjson = vres.ok ? await vres.json() : null;
      const item = vjson?.items?.[0];
      snap = { video_id: overrideVideoId, video_title: item?.snippet?.title || 'Selected video', published_at: item?.snippet?.publishedAt || null };
    } else {
      const { data } = await admin
        .from("latest_video_snapshots")
        .select("video_id, video_title, published_at")
        .eq("channel_id", channelRow.id)
        .eq("user_id", user.id)
        .single();
      snap = data;
    }
    if (!snap?.video_id) return NextResponse.json({ error: "No video available" }, { status: 400 });

    // Access token for Data/Analytics
    const tokenResult = await getValidAccessToken(user.id, channelId);
    if (!tokenResult.success) return NextResponse.json({ error: tokenResult.error || "No YouTube access" }, { status: 400 });

    // Get duration
    const videoRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${snap.video_id}`, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
    });
    let durationSec = 0;
    if (videoRes.ok) {
      const vd = await videoRes.json();
      durationSec = parseISODurationToSeconds(vd?.items?.[0]?.contentDetails?.duration || "");
    }

    // Retention (audienceWatchRatio + relativeRetentionPerformance)
    const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: "audienceWatchRatio,relativeRetentionPerformance",
      dimensions: "elapsedVideoTimeRatio",
      filters: `video==${snap.video_id}`,
      sort: "elapsedVideoTimeRatio",
    });
    let retentionRes = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
    });
    if (!retentionRes.ok) {
      const alt = new URLSearchParams(params); alt.set("ids", "channel==MINE");
      retentionRes = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${alt.toString()}`, {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
      });
    }
    const retention = retentionRes.ok ? await retentionRes.json() : null;
    const rows: any[] = Array.isArray(retention?.rows) ? retention!.rows : [];

    // Captions: get first track and download VTT if possible
    let cues: Array<{ start: number; end: number; text: string }> = [];
    try {
      const capsList = await fetch(`https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${snap.video_id}`, {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
      });
      if (capsList.ok) {
        const caps = await capsList.json();
        const items = Array.isArray(caps?.items) ? caps.items : [];
        try { console.log('[Insights][Captions] captions.list ok', { videoId: snap.video_id, items: items.length }); } catch {}
        // Choose best track: prefer English standard, then English ASR, else first
        const preferred = (items as any[]).find(i => i?.snippet?.language?.toLowerCase?.().startsWith('en') && i?.snippet?.trackKind !== 'asr')
          || (items as any[]).find(i => i?.snippet?.language?.toLowerCase?.().startsWith('en'))
          || items[0];
        const trackId = preferred?.id;
        const lang = preferred?.snippet?.language as string | undefined;
        const trackKind = preferred?.snippet?.trackKind as string | undefined;
        if (trackId) {
          const params = new URLSearchParams({ tfmt: 'vtt' });
          // If not English, request server-side translation to English
          if (!lang || !lang.toLowerCase().startsWith('en')) params.set('tlang', 'en');
          const capRes = await fetch(`https://www.googleapis.com/youtube/v3/captions/${trackId}?${params.toString()}`, {
            headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
          });
          if (capRes.ok) {
            const vtt = await capRes.text();
            cues = parseVtt(vtt).map(c => ({ ...c, text: cleanCaptionText(c.text) })).filter(c => c.text.length > 0);
            try { console.log('[Insights][Captions] captions.download ok', { trackId, vttChars: vtt.length, cueCount: cues.length, lang, trackKind }); } catch {}
          } else {
            try { console.log('[Insights][Captions] captions.download failed', { trackId, status: capRes.status, statusText: capRes.statusText }); } catch {}
          }
        }
      } else {
        try { console.log('[Insights][Captions] captions.list failed', { videoId: snap.video_id, status: capsList.status, statusText: capsList.statusText }); } catch {}
      }
    } catch (e: any) { try { console.log('[Insights][Captions] captions API error', e?.message || e); } catch {} }

    // Fallback to public timedtext endpoint if API download fails or returns no cues
    if (cues.length === 0) {
      const candidates = [
        `https://www.youtube.com/api/timedtext?fmt=vtt&lang=en&v=${snap.video_id}`,
        `https://www.youtube.com/api/timedtext?fmt=vtt&lang=en-US&v=${snap.video_id}`,
        `https://www.youtube.com/api/timedtext?fmt=vtt&lang=en&kind=asr&v=${snap.video_id}`,
      ];
      for (const url of candidates) {
        try {
          const r = await fetch(url);
          if (r.ok) {
            const vtt = await r.text();
            const parsed = parseVtt(vtt).map(c => ({ ...c, text: cleanCaptionText(c.text) })).filter(c => c.text.length > 0);
            try { console.log('[Insights][Captions] timedtext ok', { url, vttChars: vtt.length, cueCount: parsed.length }); } catch {}
            if (parsed.length > 0) { cues = parsed; break; }
          } else {
            try { console.log('[Insights][Captions] timedtext failed', { url, status: r.status, statusText: r.statusText }); } catch {}
          }
        } catch (e: any) { try { console.log('[Insights][Captions] timedtext error', { url, error: e?.message || String(e) }); } catch {} }
      }
      // If still empty, discover tracks via type=list and fetch accordingly
      if (cues.length === 0) {
        try {
          const listRes = await fetch(`https://www.youtube.com/api/timedtext?type=list&v=${snap.video_id}`);
          if (listRes.ok) {
            const xml = await listRes.text();
            try { console.log('[Insights][Captions] timedtext list ok'); } catch {}
            const tracks = parseTrackList(xml);
            for (const tr of tracks) {
              const got = (await fetchTimedtextByTrack(snap.video_id, tr)).map(c => ({ ...c, text: cleanCaptionText(c.text) })).filter(c => c.text.length > 0);
              if (got.length > 0) { cues = got; break; }
            }
          } else {
            try { console.log('[Insights][Captions] timedtext list failed', { status: listRes.status }); } catch {}
          }
        } catch (e: any) { try { console.log('[Insights][Captions] timedtext list error', e?.message || e); } catch {} }
      }
    }

    // Build candidate events from retention
    const toNum = (s: string) => Number(String(s || "").replace("%", ""));
    const events: Array<{ pct: number; time: number; awr?: number; rrp?: number }> = [];
    for (let i = 0; i < rows.length; i++) {
      const pct = toNum(rows[i]?.[0]);
      const awr = typeof rows[i]?.[1] === 'number' ? rows[i][1] : undefined;
      const rrp = typeof rows[i]?.[2] === 'number' ? rows[i][2] : undefined;
      if (isFinite(pct)) events.push({ pct, time: Math.round((pct / 100) * durationSec), awr, rrp });
    }

    // Pick key points: 25/50/75 and largest drop in AWR
    const pickPct = (p: number) => events.reduce((best, e) => !best || Math.abs(e.pct - p) < Math.abs(best.pct - p) ? e : best, undefined as any);
    const key: any[] = [10, 25, 50, 75, 90].map(pickPct).filter(Boolean);
    for (let i = 1; i < events.length; i++) {
      const drop = (events[i - 1].awr ?? 0) - (events[i].awr ?? 0);
      if (drop > 0.05) key.push(events[i]);
    }
    // De-dup by time bucket (~10s)
    const seen = new Set<number>();
    const points = key.filter(e => { const b = Math.round(e.time / 10); if (seen.has(b)) return false; seen.add(b); return true; }).slice(0, 10);

    // Extract transcript windows
    const windowSec = 20;
    let samples = points.map(e => {
      const start = Math.max(0, e.time - windowSec);
      const end = e.time + windowSec;
      const text = cues.filter(c => c.end >= start && c.start <= end).map(c => c.text).join(" ").slice(0, 800);
      return { time: e.time, pct: e.pct, awr: e.awr, rrp: e.rrp, excerpt: text };
    });

    // Hook excerpt (first 20s)
    let hookExcerpt = cues.filter(c => c.end <= 20).map(c => c.text).join(" ").slice(0, 800);

    // LLM cleanup to remove residual duplications and filler artifacts
    try {
      const client = getClient('openai');
      const toClean = [hookExcerpt, ...samples.map(s => s.excerpt)].map(t => t || "");
      const cleanPrompt = `You will receive an array of short transcript snippets from a YouTube video. 
For each snippet, remove repeated words/phrases, remove bracketed tags like [Music]/[Applause]/foreign-language tags, fix spacing and punctuation, and keep the meaning and order intact. Do not invent content. Return ONLY a JSON array of cleaned strings, same length and order as input.`;
      const completionClean = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: cleanPrompt },
          { role: 'user', content: JSON.stringify(toClean) },
        ],
        max_tokens: 500,
        temperature: 0,
      });
      const cleanedRaw = (completionClean.choices?.[0]?.message?.content || '[]').replace(/```json|```/g, '').trim();
      const cleanedArr = JSON.parse(cleanedRaw);
      if (Array.isArray(cleanedArr) && cleanedArr.length === toClean.length) {
        hookExcerpt = String(cleanedArr[0] || '');
        samples = samples.map((s, i) => ({ ...s, excerpt: String(cleanedArr[i + 1] || s.excerpt) }));
      }
    } catch {}

    // Summarize with GPT-4o
    const client = getClient('openai');
    const prompt = `You are a YouTube retention analyst. For each sample, explain in one short sentence what is happening (based on the transcript excerpt) and give one actionable suggestion to improve retention at that point. Keep it terse.
Return JSON array of {time, pct, insight, suggestion}.`;
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify({ title: snap.video_title, durationSec, samples }, null, 2) }
      ],
      max_tokens: 400,
      temperature: 0.3,
    });
    let insights: any = [];
    try {
      const raw = completion.choices?.[0]?.message?.content || '[]';
      insights = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {}

    return NextResponse.json({
      videoId: snap.video_id,
      durationSec,
      retention: rows,
      samples,
      insights,
      hookExcerpt,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


