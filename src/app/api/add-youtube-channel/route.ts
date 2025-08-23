import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getValidAccessToken } from "@/utils/googleAuth";

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

    // Get a valid access token (refreshing if necessary)
    const tokenResult = await getValidAccessToken(user.id);

    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error || "No Google access token found" }, { status: 400 });
    }

    // Get the Google account info first to determine which account will own this channel
    let googleSubId = null;
    try {
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
      );
      
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        googleSubId = userInfo.id;
        console.log("Google account ID for channel:", googleSubId);
      }
    } catch (error) {
      console.error("Failed to get Google user info:", error);
    }

    // Get channel details from YouTube API
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}`,
      { 
        headers: { 
          Authorization: `Bearer ${tokenResult.accessToken}`,
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
    const admin = createSupabaseAdminClient();
    
    // First try with google_sub field
    let { error } = await admin.from("channels").upsert(
      {
        user_id: user.id,
        channel_id: channelId,
        title: channel.snippet?.title ?? null,
        thumbnails: channel.snippet?.thumbnails ?? null,
        google_sub: googleSubId, // Store which Google account this channel belongs to
      },
      { onConflict: "user_id,channel_id" }
    );

    // If that fails (maybe google_sub column doesn't exist), try without it
    if (error && error.message?.includes('google_sub')) {
      console.log("google_sub column doesn't exist, trying without it");
      const result = await admin.from("channels").upsert(
        {
          user_id: user.id,
          channel_id: channelId,
          title: channel.snippet?.title ?? null,
          thumbnails: channel.snippet?.thumbnails ?? null,
        },
        { onConflict: "user_id,channel_id" }
      );
      error = result.error;
    }

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ 
        error: "Failed to save channel", 
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, channel: channel.snippet });
  } catch (error) {
    console.error("Add YouTube channel error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
