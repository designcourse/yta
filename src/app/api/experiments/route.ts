import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { computeQuantiles, thresholdVerdict } from '@/utils/baselines';

// GET /api/experiments?channelId=...&videoId=...
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    const videoId = url.searchParams.get('videoId');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Map external YouTube channelId -> internal channels.id UUID
    const { data: ch, error: chErr } = await supabase
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .single();
    if (chErr || !ch) return NextResponse.json({ experiments: [], latest: null });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('experiments')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel_id', ch.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;

    const experiments = Array.isArray(data) ? data : [];

    // Load recent metrics once for outcome computation
    const { data: metrics } = await admin
      .from('video_metrics')
      .select('video_id, is_short, length_band, topic_cluster, views_per_day, avg_view_duration_sec, avg_view_pct, ctr')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .order('date', { ascending: false })
      .limit(200);

    function computeOutcomeForExperiment(exp: any): 'win' | 'neutral' | 'loss' | 'pending' {
      if (!metrics || metrics.length === 0) return 'pending';
      const current = metrics.find((m: any) => m.video_id === exp.video_id);
      if (!current) return 'pending';
      const format = current.is_short ? 'short' : 'long';
      const lengthBand = current.length_band || null;
      const topicCluster = current.topic_cluster || null;
      const comparable = metrics.filter((m: any) => {
        const f = m.is_short ? 'short' : 'long';
        const okFormat = f === format;
        const okLength = (m.length_band || null) === lengthBand;
        const okTopic = topicCluster ? (m.topic_cluster || null) === topicCluster : true;
        return okFormat && okLength && okTopic;
      });
      if (comparable.length < 3) return 'pending';
      const values = {
        ctr_24h: comparable.map((m: any) => Number(m.ctr)).filter((v: any) => Number.isFinite(v)),
        avd_24h: comparable.map((m: any) => Number(m.avg_view_duration_sec)).filter((v: any) => Number.isFinite(v)),
        vpd_24h: comparable.map((m: any) => Number(m.views_per_day)).filter((v: any) => Number.isFinite(v)),
        retention_pct: comparable.map((m: any) => Number(m.avg_view_pct)).filter((v: any) => Number.isFinite(v)),
      } as const;
      const quantiles = {
        ctr_24h: computeQuantiles(values.ctr_24h),
        avd_24h: computeQuantiles(values.avd_24h),
        vpd_24h: computeQuantiles(values.vpd_24h),
        retention_pct: computeQuantiles(values.retention_pct),
      } as const;
      const currentValues = {
        ctr_24h: current.ctr ?? null,
        avd_24h: current.avg_view_duration_sec ?? null,
        vpd_24h: current.views_per_day ?? null,
        retention_pct: current.avg_view_pct ?? null,
      } as const;
      const lever: string = String(exp.lever);
      const metricKey = lever === 'ctr' ? 'ctr_24h' : lever === 'retention' ? 'avd_24h' : 'vpd_24h';
      const verdict = thresholdVerdict((currentValues as any)[metricKey], (quantiles as any)[metricKey]);
      if (verdict === 'pass') return 'win';
      if (verdict === 'fail') return 'loss';
      return 'neutral';
    }

    const withOutcomes = experiments.map((e: any) => ({ ...e, outcome_24h: computeOutcomeForExperiment(e) }));

    // Summary win rates by lever over recent experiments
    const summary = withOutcomes.reduce((acc: any, e: any) => {
      const k = e.lever || 'unknown';
      if (!acc[k]) acc[k] = { win: 0, total: 0 };
      if (e.outcome_24h !== 'pending') {
        acc[k].total += 1;
        if (e.outcome_24h === 'win') acc[k].win += 1;
      }
      return acc;
    }, {} as Record<string, { win: number; total: number }>);

    const latest = videoId ? withOutcomes.find((e: any) => e.video_id === videoId) : withOutcomes[0] || null;
    return NextResponse.json({ experiments: withOutcomes, latest, summary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

// POST /api/experiments { channelId, videoId, lever, hypothesis, recommendation, kpisBundle }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelId, videoId, lever, hypothesis, recommendation, kpisBundle } = body || {};
    if (!channelId || !videoId || !lever || !hypothesis || !recommendation) {
      return NextResponse.json({ error: 'channelId, videoId, lever, hypothesis, recommendation required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Map external YouTube channelId -> internal channels.id UUID
    const { data: ch, error: chErr } = await supabase
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .single();
    if (chErr || !ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const row = {
      user_id: user.id,
      channel_id: ch.id,
      video_id: String(videoId),
      lever: String(lever),
      hypothesis: String(hypothesis),
      recommendation: recommendation as any,
      baselines: kpisBundle?.baselines || null,
      current: kpisBundle?.current || null,
      verdicts: kpisBundle?.verdicts || null,
      comparable: kpisBundle?.comparable || null,
    };

    const { data: upserted, error } = await admin
      .from('experiments')
      .upsert(row, { onConflict: 'user_id,channel_id,video_id' })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ experiment: upserted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

// PATCH /api/experiments { id, lever?, hypothesis?, recommendation? }
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, lever, hypothesis, recommendation } = body || {};
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const updates: any = {};
    if (lever) updates.lever = String(lever);
    if (hypothesis) updates.hypothesis = String(hypothesis);
    if (recommendation) updates.recommendation = recommendation as any;

    const { data: updated, error } = await admin
      .from('experiments')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ experiment: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

// DELETE /api/experiments?id=...
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from('experiments')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


