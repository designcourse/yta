import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

// GET /api/goals?channelId=UCxxxx
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Map external channel id to internal UUID
    const { data: ch, error: chErr } = await supabase
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (chErr || !ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    const { data: row } = await supabase
      .from('goals')
      .select('weight_growth, weight_monetization, weight_community, weight_shorts')
      .eq('user_id', user.id)
      .eq('channel_id', ch.id)
      .maybeSingle();

    const defaults = {
      weight_growth: 0.4,
      weight_monetization: 0.3,
      weight_community: 0.2,
      weight_shorts: 0.1,
    };

    return NextResponse.json({ goals: row || defaults });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

// POST /api/goals { channelId, weights }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelId, weights } = body || {};
    if (!channelId || !weights) return NextResponse.json({ error: 'channelId and weights required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: ch, error: chErr } = await supabase
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (chErr || !ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    const w = {
      weight_growth: Number(weights.growth ?? 0.4),
      weight_monetization: Number(weights.monetization ?? 0.3),
      weight_community: Number(weights.community ?? 0.2),
      weight_shorts: Number(weights.shorts ?? 0.1),
    };

    // normalize to sum ~1
    const sum = [w.weight_growth, w.weight_monetization, w.weight_community, w.weight_shorts]
      .reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    if (sum > 0) {
      w.weight_growth = w.weight_growth / sum;
      w.weight_monetization = w.weight_monetization / sum;
      w.weight_community = w.weight_community / sum;
      w.weight_shorts = w.weight_shorts / sum;
    }

    const { data: upserted, error } = await supabase
      .from('goals')
      .upsert({
        user_id: user.id,
        channel_id: ch.id,
        ...w,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,channel_id' })
      .select()
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ goals: upserted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


