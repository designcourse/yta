import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelIdParam = searchParams.get("channelId");
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    
    console.log('Threads API: User ID:', user.id);

    // By default, do not return any threads until we know the channel (to avoid cross-channel leakage)
    let data: any[] | null = [];

    if (channelIdParam) {
      console.log('Threads API: Looking for channel with ID:', channelIdParam);
      
      // First, let's see what channels exist for this user
      const { data: allChannels } = await supabase
        .from("channels")
        .select("id, channel_id, title")
        .eq("user_id", user.id);
      
      console.log('Threads API: All channels for user:', allChannels);
      
      // Resolve external YouTube channel id to internal uuid
      const { data: ch, error: channelError } = await supabase
        .from("channels")
        .select("id")
        .eq("user_id", user.id)
        .eq("channel_id", channelIdParam)  // Look for YouTube channel ID
        .limit(1)
        .maybeSingle();
      
      console.log('Threads API: Channel query error:', channelError);

      console.log('Threads API: Channel lookup result:', ch);

      if (!ch?.id) {
        // Channel not found for this user – return empty list (strict isolation)
        console.log('Threads API: No channel found, returning empty');
        return NextResponse.json({ threads: [] });
      }

      console.log('Threads API: Looking for threads with channel_id:', ch.id);
      
      const { data: channelThreads, error: threadsError } = await supabase
        .from("chat_threads")
        .select("id, channel_id, title, created_at, updated_at, metadata")
        .eq("user_id", user.id)
        .eq("channel_id", ch.id)
        .order("updated_at", { ascending: false });

      console.log('Threads API: Query result:', { channelThreads, threadsError });

      data = channelThreads || [];
    } else {
      // No channel param – return empty to avoid leaking a generic user thread
      data = [];
    }
    // If no threads found for the specific channel, return empty array (no fallback)
    if ((data || []).length === 0) data = [];

    return NextResponse.json({ threads: data || [] });
  } catch (e: any) {
    console.error("List threads error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


