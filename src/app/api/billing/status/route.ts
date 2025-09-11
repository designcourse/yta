import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    // Admin check
    const { data: adminFlag } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    const isAdmin = !!adminFlag;

    const { data: sub } = await supabase
      .from('channel_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .maybeSingle();

    const hasActive = !!sub && sub.status === 'active';
    return NextResponse.json({ hasActive, isAdmin });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


