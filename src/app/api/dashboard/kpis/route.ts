import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { computeQuantiles, confidenceFromSampleSize, thresholdVerdict, thresholdVerdictWeighted } from '@/utils/baselines';
import { logAnalytics } from '@/utils/logging';
import { calculateTimeNormalizedVPD, computeWeightedQuantiles, VideoMetric } from '@/utils/time-normalized-metrics';
import { getAccurateBaselines, getOptimalTimeWindow } from '@/utils/youtube-analytics';
import { getValidAccessToken } from '@/utils/googleAuth';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    const videoId = url.searchParams.get('videoId');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createSupabaseAdminClient();

    // Load recent metrics for this channel and comparable set dims
    const { data: metrics, error } = await admin
      .from('video_metrics')
      .select('video_id, is_short, length_band, topic_cluster, views, views_per_day, avg_view_duration_sec, avg_view_pct, impressions, ctr, published_at')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .order('published_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    if (!metrics || metrics.length === 0) {
      return NextResponse.json({ channelId, baselines: null, verdicts: null, comparable: null });
    }

    // Identify target video row if provided
    const current = videoId ? metrics.find((m) => m.video_id === videoId) : metrics[0];
    console.log(`[KPIs Debug] Selected video: ${current?.video_id}, VPD: ${current?.views_per_day}, published: ${current?.published_at}`);
    console.log(`[KPIs Debug] Current video data: AVD=${current?.avg_view_duration_sec}, Retention=${current?.avg_view_pct}, CTR=${current?.ctr}`);
    const format = current?.is_short ? 'short' : 'long';
    const lengthBand = current?.length_band || null;
    const topicCluster = current?.topic_cluster || null;

    // Filter comparable set: same format + length band; topic optional if present
    const comparable = metrics.filter((m) => {
      const f = m.is_short ? 'short' : 'long';
      const okFormat = f === format;
      const okLength = (m.length_band || null) === lengthBand;
      const okTopic = topicCluster ? (m.topic_cluster || null) === topicCluster : true;
      return okFormat && okLength && okTopic;
    });

    // Get YouTube Analytics access token
    const tokenResult = await getValidAccessToken(user.id, channelId);
    let analyticsData = null;
    let useAnalyticsData = false;

    // Check if we should use YouTube Analytics or fallback to basic metrics
    const videoAgeHours = current?.published_at ? 
      (new Date().getTime() - new Date(current.published_at).getTime()) / (1000 * 60 * 60) : 
      0;
    
    const useBasicMetrics = !tokenResult.success || !current || videoAgeHours > 24 * 30; // > 30 days old
    
    if (!useBasicMetrics) {
      try {
        // Get accurate time-windowed metrics from YouTube Analytics API for recent videos
        console.log(`[KPIs Debug] Video age: ${videoAgeHours.toFixed(1)}h, attempting YouTube Analytics`);
        
        const currentVideoData = {
          videoId: current.video_id,
          publishedAt: current.published_at || '',
        };

        const compareVideosData = comparable
          .filter(m => m.video_id !== current?.video_id && m.published_at)
          .map(m => ({
            videoId: m.video_id,
            publishedAt: m.published_at || '',
          }));

        analyticsData = await getAccurateBaselines(
          {
            accessToken: tokenResult.accessToken,
            channelId: channelId,
          },
          currentVideoData,
          compareVideosData
        );
        
        useAnalyticsData = !!(analyticsData && analyticsData.current && analyticsData.baselines.length > 0);
        
        if (useAnalyticsData) {
          console.log(`[KPIs Debug] YouTube Analytics: Current=${analyticsData.current?.views || 0} views in ${analyticsData.timeWindow}, Baselines: ${analyticsData.baselines.length} videos, Success rate: ${analyticsData.successfulVideos}/${analyticsData.totalVideosRequested}`);
        }
      } catch (error) {
        console.error('[KPIs Debug] YouTube Analytics error:', error);
        return NextResponse.json({
          error: 'YouTube Analytics failed',
          details: 'Real-time windowed metrics require YouTube Analytics. Please reconnect your account with yt-analytics.readonly and ensure API is enabled.',
          channelId,
          videoId: current?.video_id || null,
          videoAge: `${videoAgeHours.toFixed(1)}h`
        }, { status: 503 });
      }
    } else {
      return NextResponse.json({
        error: 'YouTube Analytics not used for old video',
        details: 'Select a video <= 30 days old for time-windowed comparison.',
        channelId,
        videoId: current?.video_id || null,
      }, { status: 400 });
    }

    // If we got here without useAnalyticsData true, check if we at least have baseline data
    if (!useAnalyticsData) {
      // If we have baseline data but no current video data, it means the current video is too new
      if (analyticsData && analyticsData.baselines.length > 0 && !analyticsData.current) {
        // Use the current video's lifetime stats for comparison
        useAnalyticsData = true;
        console.log(`[KPIs Debug] Using lifetime stats for current video (Analytics not yet available), but real Analytics for baselines`);
      } else {
        return NextResponse.json({
          error: 'YouTube Analytics data unavailable',
          details: 'No estimates used. Please reconnect YouTube with Analytics scope or try again later.',
          channelId,
          videoId: current?.video_id || null,
        }, { status: 503 });
      }
    }

    // Gather arrays for metrics - use Analytics data when available
    const values = {
      ctr_24h: comparable
        .map((m) => m.ctr)
        .filter((v): v is number => v != null && Number.isFinite(Number(v)))
        .map((v) => Number(v)),
      avd_24h: analyticsData!.baselines
        .map((m) => m.averageViewDuration)
        .filter((v): v is number => v != null && Number.isFinite(Number(v))),
      vpd_24h: analyticsData!.baselines
        .map((m) => m.views)
        .filter((v): v is number => v != null && Number.isFinite(Number(v))),
      retention_pct: comparable
        .map((m) => m.avg_view_pct)
        .filter((v): v is number => v != null && Number.isFinite(Number(v)))
        .map((v) => Number(v)),
    } as const;

    // Fill fallback VPD data if not using Analytics
    if (!useAnalyticsData) {
      const timeNormalized = calculateTimeNormalizedVPD(
        {
          video_id: current?.video_id || '',
          views: current?.views || 0,
          published_at: current?.published_at || '',
          views_per_day: current?.views_per_day || 0,
          avg_view_duration_sec: current?.avg_view_duration_sec || null,
          avg_view_pct: current?.avg_view_pct || null,
          is_short: current?.is_short || false,
          length_band: current?.length_band || null,
          topic_cluster: current?.topic_cluster || null,
        },
        comparable.filter(m => m.video_id !== current?.video_id).map(m => ({
          video_id: m.video_id,
          views: m.views || 0,
          published_at: m.published_at || '',
          views_per_day: m.views_per_day || 0,
          avg_view_duration_sec: m.avg_view_duration_sec || null,
          avg_view_pct: m.avg_view_pct || null,
          is_short: m.is_short || false,
          length_band: m.length_band || null,
          topic_cluster: m.topic_cluster || null,
        })),
        1
      );
      (values as any).vpd_24h = timeNormalized.baselines
        .map((m) => m.normalized_vpd)
        .filter((v): v is number => v != null && Number.isFinite(Number(v)));
    }

    const quantiles = {
      ctr_24h: computeQuantiles(values.ctr_24h),
      avd_24h: computeQuantiles(values.avd_24h),
      vpd_24h: computeQuantiles([...values.vpd_24h]), // Convert readonly to mutable
      retention_pct: computeQuantiles(values.retention_pct),
    } as const;

    const sampleSize = Math.max(values.ctr_24h.length, values.avd_24h.length, values.vpd_24h.length, values.retention_pct.length);
    const confidence = confidenceFromSampleSize(sampleSize);

    // Compute verdicts for the selected video (or latest) against comparable baselines
    const currentValues = analyticsData?.current ? {
      // We have Analytics data for the current video
      ctr_24h: current?.ctr ?? null,
      avd_24h: analyticsData.current.averageViewDuration,
      vpd_24h: analyticsData.current.views,
      retention_pct: current?.avg_view_pct ?? null,
    } : {
      // Current video too new for Analytics, use lifetime stats
      ctr_24h: current?.ctr ?? null,
      avd_24h: current?.avg_view_duration_sec ?? null,
      vpd_24h: current?.views ?? null,
      retention_pct: current?.avg_view_pct ?? null,
    } as const;
    
    console.log(`[KPIs Debug] Final currentValues: AVD=${currentValues.avd_24h}, Retention=${currentValues.retention_pct}, VPD=${currentValues.vpd_24h}, CTR=${currentValues.ctr_24h}`);

    // Load user goal weights and map to metric sensitivity multipliers
    let weights: { growth: number; monetization: number; community: number; shorts: number } | null = null;
    try {
      // Resolve internal channel UUID for goals lookup
      const { data: ch } = await supabase
        .from('channels')
        .select('id')
        .eq('user_id', user.id)
        .eq('channel_id', channelId)
        .maybeSingle();
      if (ch?.id) {
        const { data: g } = await supabase
          .from('goals')
          .select('weight_growth, weight_monetization, weight_community, weight_shorts')
          .eq('user_id', user.id)
          .eq('channel_id', ch.id)
          .maybeSingle();
        if (g) {
          weights = {
            growth: Number(g.weight_growth ?? 0.4),
            monetization: Number(g.weight_monetization ?? 0.3),
            community: Number(g.weight_community ?? 0.2),
            shorts: Number(g.weight_shorts ?? 0.1),
          };
        }
      }
    } catch {}

    // Default multipliers if no weights found
    const multipliers = (() => {
      // Base factor is 0.5 IQR in default thresholdVerdict; we scale that by sensitivity
      // Heavier weight -> easier pass (narrower band), lighter weight -> harder pass (wider band)
      // Map weights to sensitivity in [0.3, 0.8]
      const map = (w: number) => {
        const clamped = Math.max(0, Math.min(1, w));
        return 0.8 - 0.5 * clamped; // w=1 => 0.3, w=0 => 0.8
      };
      const isShort = current?.is_short ? true : false;
      const w = weights || { growth: 0.4, monetization: 0.3, community: 0.2, shorts: 0.1 };
      // Metric-to-goal mapping
      return {
        ctr_24h: map(w.growth),
        avd_24h: map(w.growth), // retention quality impacts growth
        vpd_24h: map(w.growth), // velocity for growth
        retention_pct: map(w.growth),
        // Shorts emphasis: if shorts weight is high and this is a short, increase sensitivity a bit more
        shortsBoost: isShort ? (1 - 0.2 * Math.max(0, Math.min(1, w.shorts))) : 1,
        monetizationBoost: 1, // Placeholder for monetization-influenced metrics like SVR/WTPI when added
        communityBoost: 1,
      };
    })();

    const verdicts = {
      ctr_24h: thresholdVerdictWeighted(
        currentValues.ctr_24h,
        quantiles.ctr_24h,
        multipliers.ctr_24h * multipliers.shortsBoost
      ),
      avd_24h: thresholdVerdictWeighted(
        currentValues.avd_24h,
        quantiles.avd_24h,
        multipliers.avd_24h * multipliers.shortsBoost
      ),
      vpd_24h: thresholdVerdictWeighted(
        currentValues.vpd_24h,
        quantiles.vpd_24h,
        multipliers.vpd_24h * multipliers.shortsBoost
      ),
      retention_pct: thresholdVerdictWeighted(
        currentValues.retention_pct,
        quantiles.retention_pct,
        multipliers.retention_pct * multipliers.shortsBoost
      ),
    } as const;

    // Return baselines and the comparable-set definition
    const response = {
      channelId,
      videoId: current?.video_id || null,
      comparable: {
        count: comparable.length,
        dims: { format, lengthBand, topicCluster },
        confidence,
        timeNormalized: useAnalyticsData && analyticsData ? {
          method: 'youtube_analytics',
          timeWindow: analyticsData.timeWindow,
          dataSource: analyticsData.current ? 'YouTube Analytics API' : 'YouTube Analytics (baselines only)',
          successRate: `${analyticsData.successfulVideos}/${analyticsData.totalVideosRequested}`,
          confidence: analyticsData.current?.confidence || 'medium',
          note: analyticsData.current 
            ? `Real ${analyticsData.timeWindow} performance data from YouTube Analytics`
            : `Current video too new for Analytics (using lifetime stats), baselines use real ${analyticsData.timeWindow} data`
        } : {
          method: 'error',
          timeWindow: 'N/A',
          dataSource: 'None',
          confidence: 'none',
          note: 'YouTube Analytics unavailable'
        }
      },
      baselines: {
        ctr_24h: quantiles.ctr_24h,
        avd_24h: quantiles.avd_24h,
        vpd_24h: quantiles.vpd_24h,
        retention_pct: quantiles.retention_pct,
      },
      current: currentValues,
      verdicts,
      goals: weights || null,
    } as const;

    // Best-effort analytics log (PII-safe)
    try {
      await logAnalytics(supabase as any, {
        userId: user.id,
        channelId,
        videoId: response.videoId,
        comparable: response.comparable,
        baselines: response.baselines,
        current: response.current,
        verdicts: response.verdicts,
        goals: response.goals,
        sampleSize: comparable.length,
      });
    } catch {}

    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


