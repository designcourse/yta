import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { computeQuantiles, confidenceFromSampleSize, thresholdVerdict } from '@/utils/baselines';

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
      ctr_24h: comparable.map((m) => Number(m.ctr)).filter((x) => Number.isFinite(x)),
      avd_24h: comparable.map((m) => Number(m.avg_view_duration_sec)).filter((x) => Number.isFinite(x)),
      vpd_24h: comparable.map((m) => Number(m.views_per_day)).filter((x) => Number.isFinite(x)),
      retention_pct: comparable.map((m) => Number(m.avg_view_pct)).filter((x) => Number.isFinite(x)),
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

    const verdicts = {
      ctr_24h: thresholdVerdict(currentValues.ctr_24h, quantiles.ctr_24h),
      avd_24h: thresholdVerdict(currentValues.avd_24h, quantiles.avd_24h),
      vpd_24h: thresholdVerdict(currentValues.vpd_24h, quantiles.vpd_24h),
      retention_pct: thresholdVerdict(currentValues.retention_pct, quantiles.retention_pct),
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
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


