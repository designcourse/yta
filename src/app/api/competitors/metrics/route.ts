import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";

function daysSince(iso: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  return Math.max(1, Math.floor(diff / (24 * 3600 * 1000)));
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","at","by","from","up","down","over","under","is","are","was","were","be","been","it","this","that","these","those","you","your","i","we","they","our","my","how","what","why","when","who","vs","v","&","|","-","—","#"
]);

function extractKeywords(title: string): string[] {
  return (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
    .slice(0, 12);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // First, try cache (3h TTL)
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
    const { data: competitorRows, error } = await supabase
      .from("competitors")
      .select("competitor_channel_id, competitor_title, metadata")
      .eq("user_id", user.id)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Try to read cache entries first
    const results: any[] = [];
    const now = Date.now();
    const missing: { compId: string; row: any }[] = [];
    for (const row of competitorRows || []) {
      const compId = row.competitor_channel_id as string;
      const { data: cacheRow } = await supabase
        .from('competitor_metrics_cache')
        .select('payload, refreshed_at')
        .eq('user_id', user.id)
        .eq('channel_id', channelId)
        .eq('competitor_channel_id', compId)
        .maybeSingle();
      const fresh = cacheRow?.refreshed_at ? (now - new Date(cacheRow.refreshed_at).getTime() < THREE_HOURS_MS) : false;
      if (fresh && cacheRow?.payload) {
        results.push({ competitor_channel_id: compId, competitor_title: row.competitor_title || null, basic: row.metadata || null, metrics: cacheRow.payload });
      } else {
        missing.push({ compId, row });
      }
    }

    // If anything missing or stale, fetch live and upsert cache
    if (missing.length > 0) {
      const token = await getValidAccessToken(user.id, channelId);
      if (!token.success) {
        // If we cannot fetch new data, still return what we had cached
        return NextResponse.json({ results });
      }
      const accessToken = token.accessToken;

      for (const { compId, row } of missing) {
        // Fetch recent uploads via search (last 10 videos)
        const searchRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(compId)}&type=video&order=date&maxResults=10`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const searchJson = searchRes.ok ? await searchRes.json() : { items: [] };
        const searchItems: any[] = Array.isArray(searchJson?.items) ? searchJson.items : [];
        const videoIds = searchItems.map((it: any) => it?.id?.videoId).filter(Boolean) as string[];

        let videos: any[] = [];
        if (videoIds.length > 0) {
          const videosRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(videoIds.join(','))}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const vjson = videosRes.ok ? await videosRes.json() : { items: [] };
          videos = Array.isArray(vjson?.items) ? vjson.items : [];
        }

        const perVideo = videos.map((v: any) => {
          const publishedAt = String(v?.snippet?.publishedAt || "");
          const views = Number(v?.statistics?.viewCount || 0);
          const vpd = views / daysSince(publishedAt);
          const title = String(v?.snippet?.title || "");
          return { id: String(v?.id || ""), title, publishedAt, views, vpd };
        });

        const avgVpd = perVideo.length ? perVideo.reduce((s, x) => s + x.vpd, 0) / perVideo.length : 0;
        const keywordMap = new Map<string, { totalVpd: number; count: number }>();
        for (const pv of perVideo) {
          for (const kw of extractKeywords(pv.title)) {
            const cur = keywordMap.get(kw) || { totalVpd: 0, count: 0 };
            cur.totalVpd += pv.vpd;
            cur.count += 1;
            keywordMap.set(kw, cur);
          }
        }
        const topicHitRates = Array.from(keywordMap.entries())
          .filter(([, v]) => v.count >= 2)
          .map(([kw, v]) => ({ keyword: kw, avgVpd: v.totalVpd / v.count, count: v.count }))
          .sort((a, b) => b.avgVpd - a.avgVpd)
          .slice(0, 8);

        perVideo.sort((a, b) => b.vpd - a.vpd);
        const topVideos = perVideo.slice(0, 3);
        const payload = {
          avgVpd: Math.round(avgVpd * 100) / 100,
          topVideos,
          topicHitRates,
          sampleSize: perVideo.length,
        };

        // Upsert cache
        await supabase
          .from('competitor_metrics_cache')
          .upsert({ user_id: user.id, channel_id: channelId, competitor_channel_id: compId, payload, refreshed_at: new Date().toISOString() }, { onConflict: 'user_id,channel_id,competitor_channel_id' });

        results.push({ competitor_channel_id: compId, competitor_title: row.competitor_title || null, basic: row.metadata || null, metrics: payload });
      }
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


