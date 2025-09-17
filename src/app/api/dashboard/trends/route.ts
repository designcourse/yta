import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

type TrendPoint = {
  video_id: string;
  is_short: boolean | null;
  length_band: string | null;
  topic_cluster: string | null;
  avd_24h: number | null; // seconds
  vpd_24h: number | null; // views per day
  wtpi_sec: number | null; // seconds per impression (ctr * avd)
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    const format = url.searchParams.get('format'); // 'short' | 'long' | undefined
    const lengthBand = url.searchParams.get('lengthBand'); // e.g., '9-13m'
    const topicCluster = url.searchParams.get('topic');
    const limitParam = url.searchParams.get('limit');
    const limit = Math.max(1, Math.min(50, Number(limitParam) || 10));

    if (!channelId) {
      return NextResponse.json({ error: 'channelId required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createSupabaseAdminClient();

    // Pull recent metrics; we will dedupe by video_id to get latest snapshot per upload
    const { data: metrics, error } = await admin
      .from('video_metrics')
      .select('video_id, is_short, length_band, topic_cluster, views_per_day, avg_view_duration_sec, ctr, date')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .order('date', { ascending: false })
      .limit(500);
    if (error) throw error;

    if (!metrics || metrics.length === 0) {
      return NextResponse.json({
        channelId,
        appliedFilters: { format: format || null, lengthBand: lengthBand || null, topicCluster: topicCluster || null },
        availableFilters: { formats: [], lengthBands: [], topicClusters: [] },
        points: { avd_24h: [], vpd_24h: [], wtpi_sec: [] },
      });
    }

    // Compute available filter options from the dataset (latest snapshots are not required for this)
    const formatsSet = new Set<string>();
    const lengthBandsSet = new Set<string>();
    const topicClustersSet = new Set<string>();
    for (const m of metrics) {
      const f = m.is_short ? 'short' : 'long';
      formatsSet.add(f);
      if (m.length_band) lengthBandsSet.add(m.length_band);
      if (m.topic_cluster) topicClustersSet.add(m.topic_cluster);
    }

    // Latest snapshot per video_id
    const latestByVideo = new Map<string, any>();
    for (const row of metrics) {
      if (!latestByVideo.has(row.video_id)) {
        latestByVideo.set(row.video_id, row);
      }
    }

    // Apply filters (if provided)
    const filtered = Array.from(latestByVideo.values()).filter((m) => {
      if (format && format !== 'all') {
        const f = m.is_short ? 'short' : 'long';
        if (f !== format) return false;
      }
      if (lengthBand && lengthBand !== 'all') {
        if ((m.length_band || null) !== lengthBand) return false;
      }
      if (topicCluster && topicCluster !== 'all') {
        if ((m.topic_cluster || null) !== topicCluster) return false;
      }
      return true;
    });

    // Take the most recent N uploads after filtering
    const recent = filtered.slice(0, limit);

    const trendPoints: TrendPoint[] = recent
      .map((m) => {
        const avd = Number.isFinite(Number(m.avg_view_duration_sec)) ? Number(m.avg_view_duration_sec) : null;
        const vpd = Number.isFinite(Number(m.views_per_day)) ? Number(m.views_per_day) : null;
        const ctr = Number.isFinite(Number(m.ctr)) ? Number(m.ctr) : null;
        const wtpi = avd != null && ctr != null ? ctr * avd : null;
        return {
          video_id: m.video_id,
          is_short: !!m.is_short,
          length_band: m.length_band || null,
          topic_cluster: m.topic_cluster || null,
          avd_24h: avd,
          vpd_24h: vpd,
          wtpi_sec: wtpi,
        } as TrendPoint;
      })
      // Oldest-to-newest for chart left-to-right
      .reverse();

    return NextResponse.json({
      channelId,
      appliedFilters: { format: format || 'all', lengthBand: lengthBand || 'all', topicCluster: topicCluster || 'all' },
      availableFilters: {
        formats: Array.from(formatsSet.values()),
        lengthBands: Array.from(lengthBandsSet.values()),
        topicClusters: Array.from(topicClustersSet.values()),
      },
      points: {
        avd_24h: trendPoints.map((p) => ({ video_id: p.video_id, value: p.avd_24h })),
        vpd_24h: trendPoints.map((p) => ({ video_id: p.video_id, value: p.vpd_24h })),
        wtpi_sec: trendPoints.map((p) => ({ video_id: p.video_id, value: p.wtpi_sec })),
      },
      meta: {
        count: trendPoints.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


