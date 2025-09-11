import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId } = await request.json();
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const { data: adminFlag } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!adminFlag) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const admin = createSupabaseAdminClient();
    await admin.from('channel_subscriptions').upsert({
      user_id: user.id,
      channel_id: channelId,
      plan: 'comped',
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,channel_id' });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


