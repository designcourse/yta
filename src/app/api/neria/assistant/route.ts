import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { ensureVectorStoreForChannel } from '@/utils/neria-assistant';
import { getClient } from '@/utils/openai';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { channelId } = await request.json();
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: channel } = await admin
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    const vectorStoreId = await ensureVectorStoreForChannel(channel.id);
    const client = (getClient('openai') as OpenAI);

    // Create or reuse an Assistant that is retrieval-enabled
    const assistant = await (client as any).beta.assistants.create({
      name: 'Neria Coach',
      instructions: 'You are Neria, a YouTube strategy coach. Retrieve facts from the attached vector store and call functions when needed to fetch fresh KPIs. Always cite concrete numbers from retrieved facts or tools. Never guess.',
      model: 'gpt-4o',
      tools: [
        { type: 'retrieval' },
        {
          type: 'function',
          function: {
            name: 'get_kpis',
            description: 'Fetch KPIs for a specific channel/video',
            parameters: {
              type: 'object',
              properties: {
                channelId: { type: 'string' },
                videoId: { type: 'string' },
              },
              required: ['channelId'],
            },
          },
        },
      ],
      tool_resources: {
        vector_stores: [vectorStoreId],
      },
    });

    return NextResponse.json({ assistantId: assistant.id, vectorStoreId });
  } catch (error) {
    console.error('[AssistantSetup] Error:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}


