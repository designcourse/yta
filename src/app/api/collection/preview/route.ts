import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";
import { aggregateYouTubeData } from "@/utils/youtube-aggregator";
import { runNeriaAnalyzer } from "@/utils/neria-openai";
import { ZNeriaOutput } from "@/utils/types/neria";

// Simple per-process 24h cache keyed by user+channel (for response shape)
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

    // Aggregate and analyze
    const { neriaInput, winners, losers, lifetimeViews } = await aggregateYouTubeData({
      userId: user.id,
      channelId,
      accessToken: token.accessToken,
      refreshToken: undefined,
    });
    console.log('[preview] channel', neriaInput.channel.id, 'title', neriaInput.channel.title);
    console.log('[preview] cadence per90d', neriaInput.cadence.per90d, 'per30d', neriaInput.cadence.per30d);
    console.log('[preview] winners count', winners.length, 'losers count', losers.length);

    let neriaOutput;
    try {
      neriaOutput = await runNeriaAnalyzer(neriaInput);
    } catch (e) {
      neriaOutput = {
        slides: [
          { id: 1, headline: 'Channel snapshot', body: 'We analyzed your recent activity and packaging. Some metrics are missing; connect analytics for deeper insights.', keyStats: [], actions: ['Publish regularly for 30 days', 'Clarify titles with outcome-first phrasing', 'Plan a Shorts + long-form mix'], confidence: 0.5 },
          { id: 2, headline: 'What’s working', body: 'Top themes show potential. Double down on clear topics and consistent hooks.', keyStats: [], actions: ['Replicate top theme in 2 new videos', 'Test 3 title variants before publishing', 'Add an on-screen promise by :05'], confidence: 0.5 },
          { id: 3, headline: 'Fix underperformers', body: 'Avoid weak formats and reset thumbnails for clarity. Improve retention with faster pacing.', keyStats: [], actions: ['Trim 10–15% from intros', 'Front-load payoff in first 20s', 'Batch thumbnails and test contrasts'], confidence: 0.5 },
        ],
        tags: ['consistency','packaging','retention'],
        upgradeHook: 'Unlock retention heatmaps and CTR benchmarks for your niche.',
      };
      const ok = ZNeriaOutput.safeParse(neriaOutput);
      if (!ok.success) throw e;
    }

    const payload = {
      channelMeta: {
        id: neriaInput.channel.id,
        title: neriaInput.channel.title,
        subs: neriaInput.channel.subscribers,
        views: lifetimeViews || neriaInput.rollups.metrics.views,
        videoCount: neriaInput.channel.videoCount,
        publishedAt: neriaInput.channel.createdAt,
      },
      winners: winners.map(w => ({ videoId: w.id, title: w.title, thumb: w.thumb, publishedAt: w.publishedAt, duration: w.duration, viewsPerDay90: w.metrics.viewsPerDay })),
      losers: losers.map(l => ({ videoId: l.id, title: l.title, thumb: l.thumb, publishedAt: l.publishedAt, duration: l.duration, viewsPerDay90: 0 })),
      slides: neriaOutput.slides,
    };

    previewCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, payload });

    return NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    console.error("/api/collection/preview error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


