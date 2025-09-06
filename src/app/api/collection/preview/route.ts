import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";
import { getClient } from "@/utils/openai";
import { getPrompt, renderTemplate } from "@/utils/prompts";

type AnalyticsRow = {
  video: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  publishedAt?: string;
};

// Simple per-process 24h cache keyed by user+channel
const previewCache = new Map<string, { expiresAt: number; payload: any }>();
const TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId");
    const refresh = url.searchParams.get("refresh");
    if (!channelId) {
      return NextResponse.json({ error: "channelId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const cacheKey = `${user.id}:${channelId}`;
    const cached = previewCache.get(cacheKey);
    if (!refresh && cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, { headers: { "Cache-Control": "public, max-age=86400" } });
    }

    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) return NextResponse.json({ error: token.error || "No YouTube access" }, { status: 400 });
    const accessToken = token.accessToken;

    // 1) channels.list
    const channelsRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&mine=true&fields=items(id,snippet(publishedAt,title,description),statistics(viewCount,subscriberCount,videoCount))",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!channelsRes.ok) {
      const t = await channelsRes.text();
      return NextResponse.json({ error: "channels.list failed", details: t }, { status: 500 });
    }
    const channelsJson = await channelsRes.json();
    const channel = channelsJson?.items?.[0];
    if (!channel) return NextResponse.json({ error: "No channel found" }, { status: 404 });

    // Precompute enrichment (summary + slide 1 text) regardless of analytics result
    let shortDescription = "";
    let slide1Text = "";
    try {
      const promptTpl = await getPrompt('collection_description_summary');
      const rendered = renderTemplate(promptTpl, { about_text: channel?.snippet?.description || '' });
      const client = getClient('openai');
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: rendered }
        ],
        max_tokens: 120,
        temperature: 0.5,
      });
      shortDescription = completion.choices?.[0]?.message?.content?.trim() || "";

      const greetTpl = await getPrompt('collection_greeting');
      const greetRendered = renderTemplate(greetTpl, {
        given_name: '',
        channel_title: channel?.snippet?.title || '',
        subscriber_count: String(channel?.statistics?.subscriberCount || 0),
        video_count: String(channel?.statistics?.videoCount || 0),
      });
      const greetComp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Neria, a warm, concise YouTube coach.' },
          { role: 'user', content: greetRendered }
        ],
        max_tokens: 120,
        temperature: 0.6,
      });
      slide1Text = greetComp.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      console.warn('[collection.preview] OpenAI enrichment skipped:', e);
    }

    // 2) Analytics API reports.query for last 90d, per-video metrics
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const baseParams = {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions: "video",
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained",
      maxResults: "200",
      sort: "-views",
    } as const;

    const attempts = [
      new URLSearchParams({ ...baseParams, ids: `channel==${channelId}` } as any),
      new URLSearchParams({ ...baseParams, ids: `channel==MINE` } as any),
    ];

    let analyticsRes: Response | null = null;
    let lastErrText: string | null = null;
    for (const params of attempts) {
      const res = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) { analyticsRes = res; break; }
      lastErrText = await res.text().catch(() => null);
    }

    if (!analyticsRes || !analyticsRes.ok) {
      const t = lastErrText || "";
      console.error("[collection.preview] analytics.reports failed", t);
      return NextResponse.json({
        channel: {
          id: channel.id,
          title: channel?.snippet?.title || "",
          description: shortDescription || channel?.snippet?.description || "",
          subs: Number(channel?.statistics?.subscriberCount || 0),
          views: Number(channel?.statistics?.viewCount || 0),
          videoCount: Number(channel?.statistics?.videoCount || 0),
          publishedAt: channel?.snippet?.publishedAt || "",
        },
        analytics90d: { baseline: { ctrMedian: 0, avgPctMedian: 0 } },
        winners: [],
        loserIds: [],
        slide1Text,
        warning: "analytics.reports failed",
        details: t,
      }, { status: 200 });
    }
    const analyticsJson = await analyticsRes.json();

    const rows: AnalyticsRow[] = Array.isArray(analyticsJson?.rows)
      ? analyticsJson.rows.map((r: any[]) => ({
          video: String(r[0] ?? ""),
          views: Number(r[1] ?? 0),
          estimatedMinutesWatched: Number(r[2] ?? 0),
          averageViewDuration: Number(r[3] ?? 0),
          averageViewPercentage: Number(r[4] ?? 0),
          subscribersGained: Number(r[5] ?? 0),
        }))
      : [];

    // Baselines
    const median = (nums: number[]) => {
      if (nums.length === 0) return 0;
      const s = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
    };

    const ctrMedian = 0; // impressions CTR not available in this report
    const avgPctMedian = median(rows.map(r => r.averageViewPercentage || 0));

    // Compute daysSinceUploadWithin90 after we fetch publishedAt per video; initially default to 90.
    const defaultDays = 90;
    const rowsById = new Map(rows.map(r => [r.video, r] as const));

    // Top by views per day requires publishedAt. We'll compute provisional using 90-day denominator, then refine for winners.
    const provisional = rows.map(r => ({
      id: r.video,
      viewsPerDay: r.views / Math.max(1, defaultDays),
    }));

    provisional.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
    const topIds = provisional.slice(0, 10).map(x => x.id);
    const bottomIds = provisional.slice(-10).map(x => x.id);
    const worst = provisional.reduce((min, cur) => (cur.viewsPerDay < min.viewsPerDay ? cur : min), provisional[0] || { id: '', viewsPerDay: Number.POSITIVE_INFINITY });
    const primaryLoserId = worst?.id || (bottomIds.length > 0 ? bottomIds[bottomIds.length - 1] : '');

    // 3) videos.list for winners only, refine viewsPerDay with exact days in window since upload
    let winners: any[] = [];
    if (topIds.length > 0) {
      const videosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(topIds.join(","))}&fields=items(id,snippet(title,thumbnails,publishedAt),contentDetails(duration))`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (videosRes.ok) {
        const vjson = await videosRes.json();
        const now = new Date();
        winners = (vjson?.items || []).map((it: any) => {
          const id = it.id as string;
          const r = rowsById.get(id);
          const publishedAt = it?.snippet?.publishedAt ? new Date(it.snippet.publishedAt) : undefined;
          const since = publishedAt ? Math.min(90, Math.max(1, Math.ceil((now.getTime() - publishedAt.getTime()) / (24 * 3600 * 1000)))) : defaultDays;
          const viewsPerDay = r ? r.views / Math.max(1, since) : 0;
          return {
            id,
            title: it?.snippet?.title || "",
            thumb: it?.snippet?.thumbnails?.medium?.url || it?.snippet?.thumbnails?.default?.url || "",
            publishedAt: it?.snippet?.publishedAt || "",
            duration: it?.contentDetails?.duration || "",
            metrics: r ? {
              views: r.views,
              watchTime: r.estimatedMinutesWatched,
              avgViewDur: r.averageViewDuration,
              avgViewPct: r.averageViewPercentage,
              impressions: 0,
              ctr: 0,
              subsGained: r.subscribersGained,
              viewsPerDay,
            } : {
              views: 0, watchTime: 0, avgViewDur: 0, avgViewPct: 0, impressions: 0, ctr: 0, subsGained: 0, viewsPerDay: 0
            }
          };
        });
        // Re-sort refined winners by viewsPerDay
        winners.sort((a, b) => b.metrics.viewsPerDay - a.metrics.viewsPerDay);
        if (winners.length > 10) winners = winners.slice(0, 10);
      } else {
        const vt = await videosRes.text();
        console.error("[collection.preview] videos.list failed", vt);
      }
    }

    // Generate a theme line for Slide 2 based on winners
    let slide2Text = '';
    let slide3Text = '';
    try {
      const themeTpl = await getPrompt('collection_winners_theme');
      const winnersTitles = JSON.stringify(winners.map(w => w.title));
      const themeRendered = renderTemplate(themeTpl, {
        winners_titles: winnersTitles,
        channel_title: channel?.snippet?.title || ''
      });
      const client = getClient('openai');
      const themeComp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Neria, a concise YouTube coach.' },
          { role: 'user', content: themeRendered }
        ],
        max_tokens: 80,
        temperature: 0.4,
      });
      slide2Text = themeComp.choices?.[0]?.message?.content?.trim() || '';
      // losers theme
      const losersTitles = JSON.stringify(bottomIds.map(id => id).slice(0, 10));
      const losersTpl = await getPrompt('collection_losers_theme');
      const losersRendered = renderTemplate(losersTpl, {
        losers_titles: losersTitles,
        channel_title: channel?.snippet?.title || ''
      });
      const losersComp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Neria, a concise YouTube coach.' },
          { role: 'user', content: losersRendered }
        ],
        max_tokens: 80,
        temperature: 0.4,
      });
      slide3Text = losersComp.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      slide2Text = '';
      slide3Text = '';
    }

    // Generate a short description and a custom slide 1 line via OpenAI using system_prompts
    const payload = {
      channel: {
        id: channel.id,
        title: channel?.snippet?.title || "",
        description: shortDescription || channel?.snippet?.description || "",
        subs: Number(channel?.statistics?.subscriberCount || 0),
        views: Number(channel?.statistics?.viewCount || 0),
        videoCount: Number(channel?.statistics?.videoCount || 0),
        publishedAt: channel?.snippet?.publishedAt || "",
      },
      analytics90d: { baseline: { ctrMedian, avgPctMedian } },
      winners,
      loserIds: bottomIds,
      primaryLoserId,
      slide1Text,
      slide2Text,
      slide3Text,
    };

    previewCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, payload });

    return NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    console.error("/api/collection/preview error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


