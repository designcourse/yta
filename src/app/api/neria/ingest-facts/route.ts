import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { ensureVectorStoreForChannel, uploadFactsDocToVectorStore } from '@/utils/neria-assistant';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { channelId, doc } = body as { channelId: string; doc: any };
    if (!channelId || !doc) return NextResponse.json({ error: 'channelId and doc required' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: channel } = await admin
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    const vectorStoreId = await ensureVectorStoreForChannel(channel.id);
    const fileId = await uploadFactsDocToVectorStore(vectorStoreId, {
      ...doc,
      internalChannelId: channel.id,
      channelId,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, vectorStoreId, fileId });
  } catch (error) {
    console.error('[IngestFacts] Error:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}


