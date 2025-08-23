import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelId } = body;

    if (!channelId) {
      return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the user's Google access token
    const admin = createSupabaseAdminClient();
    const { data: googleAccount } = await admin
      .from("google_accounts")
      .select("access_token")
      .eq("user_id", user.id)
      .single();

    if (!googleAccount?.access_token) {
      return NextResponse.json({ error: "No Google access token found" }, { status: 400 });
    }

    // Get channel details from YouTube API
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}`,
      { 
        headers: { 
          Authorization: `Bearer ${googleAccount.access_token}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    if (!channelResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch channel details" }, { status: 400 });
    }

    const channelData = await channelResponse.json();
    const channel = channelData.items?.[0];

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Add channel to database
    const { error } = await admin.from("channels").upsert(
      {
        user_id: user.id,
        channel_id: channelId,
        title: channel.snippet?.title ?? null,
        thumbnails: channel.snippet?.thumbnails ?? null,
      },
      { onConflict: "user_id,channel_id" }
    );

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to save channel" }, { status: 500 });
    }

    return NextResponse.json({ success: true, channel: channel.snippet });
  } catch (error) {
    console.error("Add YouTube channel error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
