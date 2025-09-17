import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { computeQuantiles, Quantiles } from '@/utils/baselines';

type MetricKey = 'ctr_24h' | 'avd_24h' | 'vpd_24h' | 'retention_pct';

type GroupWinRates = {
  key: string;
  count: number;
  metrics: Record<MetricKey, { passRate: number | null; sample: number }>; // 0..1 pass rate
  overall: number | null; // average of available metric passRates
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    const limitParam = url.searchParams.get('limit');
    const limit = Math.max(5, Math.min(200, Number(limitParam) || 200));
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createSupabaseAdminClient();

    const { data: rows, error } = await admin
      .from('video_metrics')
      .select('video_id, is_short, length_band, topic_cluster, views_per_day, avg_view_duration_sec, avg_view_pct, ctr, date')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .order('date', { ascending: false })
      .limit(1000);
    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ channelId, byLengthBand: [], byTopicCluster: [] });
    }

    // Latest snapshot per video
    const latestByVideo = new Map<string, any>();
    for (const r of rows) {
      if (!latestByVideo.has(r.video_id)) latestByVideo.set(r.video_id, r);
    }

    const videos = Array.from(latestByVideo.values()).slice(0, limit);

    // Prepare groups
    const groupsByLength = new Map<string, any[]>();
    const groupsByTopic = new Map<string, any[]>();
    for (const v of videos) {
      const lb = v.length_band || 'unknown';
      if (!groupsByLength.has(lb)) groupsByLength.set(lb, []);
      groupsByLength.get(lb)!.push(v);

      const tc = v.topic_cluster || 'unknown';
      if (!groupsByTopic.has(tc)) groupsByTopic.set(tc, []);
      groupsByTopic.get(tc)!.push(v);
    }

    const computeGroupWinRates = (key: string, items: any[]): GroupWinRates => {
      const values = {
        ctr_24h: items
          .map((m) => Number(m.ctr))
          .filter((v) => Number.isFinite(v)) as number[],
        avd_24h: items
          .map((m) => Number(m.avg_view_duration_sec))
          .filter((v) => Number.isFinite(v)) as number[],
        vpd_24h: items
          .map((m) => Number(m.views_per_day))
          .filter((v) => Number.isFinite(v)) as number[],
        retention_pct: items
          .map((m) => Number(m.avg_view_pct))
          .filter((v) => Number.isFinite(v)) as number[],
      } as const;

      const quantiles: Record<MetricKey, Quantiles | null> = {
        ctr_24h: computeQuantiles(values.ctr_24h),
        avd_24h: computeQuantiles(values.avd_24h),
        vpd_24h: computeQuantiles(values.vpd_24h),
        retention_pct: computeQuantiles(values.retention_pct),
      };

      const passRateFor = (metric: MetricKey): { passRate: number | null; sample: number } => {
        const q = quantiles[metric];
        if (!q) return { passRate: null, sample: 0 };
        const upper = q.median + 0.5 * q.iqr;
        const arr = values[metric as keyof typeof values] as number[];
        const sample = arr.length;
        if (sample === 0) return { passRate: null, sample: 0 };
        const passes = arr.filter((v) => Number.isFinite(v) && v >= upper).length;
        return { passRate: passes / sample, sample };
      };

      const m: Record<MetricKey, { passRate: number | null; sample: number }> = {
        ctr_24h: passRateFor('ctr_24h'),
        avd_24h: passRateFor('avd_24h'),
        vpd_24h: passRateFor('vpd_24h'),
        retention_pct: passRateFor('retention_pct'),
      };

      const present = Object.values(m)
        .map((x) => x.passRate)
        .filter((x): x is number => x != null && Number.isFinite(x));
      const overall = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : null;

      return {
        key,
        count: items.length,
        metrics: m,
        overall,
      };
    };

    const byLengthBand: GroupWinRates[] = Array.from(groupsByLength.entries())
      .map(([key, items]) => computeGroupWinRates(key, items))
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));

    const byTopicCluster: GroupWinRates[] = Array.from(groupsByTopic.entries())
      .map(([key, items]) => computeGroupWinRates(key, items))
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));

    return NextResponse.json({ channelId, byLengthBand, byTopicCluster });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


