import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    
    if (!channelId) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get channel information from our database
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("title, thumbnails, subscriber_count, video_count, view_count, published_at")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError || !channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Return the channel data with a consistent format
    return NextResponse.json({
      channel: {
        title: channel.title,
        thumbnails: channel.thumbnails || {},
        subscriber_count: channel.subscriber_count,
        video_count: channel.video_count,
        view_count: channel.view_count,
        published_at: channel.published_at
      }
    });

  } catch (error) {
    console.error("Channel info error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
