import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

/**
 * Clear chat history for a thread
 * DELETE /api/neria/clear-history
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get('threadId');

    if (!threadId) {
      return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify thread belongs to user
    const { data: thread } = await supabase
      .from('chat_threads')
      .select('id')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single();

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Delete all messages for this thread
    const { error: deleteError } = await supabase
      .from('chat_messages')
      .delete()
      .eq('thread_id', threadId);

    if (deleteError) {
      console.error('[Neria][ClearHistory] Failed to delete messages:', deleteError);
      return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 });
    }

    console.log('[Neria][ClearHistory] Cleared history for thread:', threadId);
    return NextResponse.json({ success: true, threadId });

  } catch (error) {
    console.error('[Neria][ClearHistory] Error:', error);
    return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 });
  }
}

