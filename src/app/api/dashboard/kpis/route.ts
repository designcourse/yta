import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { computeQuantiles, confidenceFromSampleSize, thresholdVerdict, thresholdVerdictWeighted } from '@/utils/baselines';

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
      .select('video_id, is_short, length_band, topic_cluster, views, views_per_day, avg_view_duration_sec, avg_view_pct, impressions, ctr')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .order('date', { ascending: false })
      .limit(200);
    if (error) throw error;

    if (!metrics || metrics.length === 0) {
      return NextResponse.json({ channelId, baselines: null, verdicts: null, comparable: null });
    }

    // Identify target video row if provided
    const current = videoId ? metrics.find((m) => m.video_id === videoId) : metrics[0];
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

    // Gather arrays for metrics (only numbers)
    const values = {
      ctr_24h: comparable
        .map((m) => m.ctr)
        .filter((v): v is number => v != null && Number.isFinite(Number(v)))
        .map((v) => Number(v)),
      avd_24h: comparable
        .map((m) => m.avg_view_duration_sec)
        .filter((v): v is number => v != null && Number.isFinite(Number(v)))
        .map((v) => Number(v)),
      vpd_24h: comparable
        .map((m) => m.views_per_day)
        .filter((v): v is number => v != null && Number.isFinite(Number(v)))
        .map((v) => Number(v)),
      retention_pct: comparable
        .map((m) => m.avg_view_pct)
        .filter((v): v is number => v != null && Number.isFinite(Number(v)))
        .map((v) => Number(v)),
    } as const;

    const quantiles = {
      ctr_24h: computeQuantiles(values.ctr_24h),
      avd_24h: computeQuantiles(values.avd_24h),
      vpd_24h: computeQuantiles(values.vpd_24h),
      retention_pct: computeQuantiles(values.retention_pct),
    } as const;

    const sampleSize = Math.max(values.ctr_24h.length, values.avd_24h.length, values.vpd_24h.length, values.retention_pct.length);
    const confidence = confidenceFromSampleSize(sampleSize);

    // Compute verdicts for the selected video (or latest) against comparable baselines
    const currentValues = {
      ctr_24h: current?.ctr ?? null,
      avd_24h: current?.avg_view_duration_sec ?? null,
      vpd_24h: current?.views_per_day ?? null,
      retention_pct: current?.avg_view_pct ?? null,
    } as const;

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
    return NextResponse.json({
      channelId,
      videoId: current?.video_id || null,
      comparable: {
        count: comparable.length,
        dims: { format, lengthBand, topicCluster },
        confidence,
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
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


