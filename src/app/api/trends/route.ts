import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { refreshTrendsForChannel, getTrendsForChannel } from '@/utils/trends';
import { patchNeriaContextTrends } from '@/utils/neria-context';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { items, stale, fetchedAt, expiresAt } = await getTrendsForChannel(user.id, channelId);
    return NextResponse.json({ channelId, items, stale, fetchedAt, expiresAt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const channelId = body?.channelId as string | undefined;
    const force = !!body?.force;
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const refreshed = await refreshTrendsForChannel(user.id, channelId, { force, limit: 10 });
    if (!refreshed) {
      // TTL not elapsed
      const existing = await getTrendsForChannel(user.id, channelId);
      return NextResponse.json({ channelId, items: existing.items, stale: existing.stale, fetchedAt: existing.fetchedAt, expiresAt: existing.expiresAt, fromCache: true });
    }
    // Patch Neria context with fresh trends
    try {
      await patchNeriaContextTrends(refreshed.internalChannelId);
    } catch {}
    return NextResponse.json({ channelId, items: refreshed.items, stale: false, fetchedAt: refreshed.fetchedAt, expiresAt: refreshed.expiresAt, fromCache: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


