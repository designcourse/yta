import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
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

    // Get channel details from YouTube API with statistics
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}`,
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

    // Calculate account age
    const publishedAt = new Date(channel.snippet.publishedAt);
    const now = new Date();
    const accountAgeInDays = Math.floor((now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24));
    const accountAge = `${Math.floor(accountAgeInDays / 365)} years, ${accountAgeInDays % 365} days`;

    // Extract the data we need
    const collectedData = {
      subscriberCount: parseInt(channel.statistics.subscriberCount),
      videoCount: parseInt(channel.statistics.videoCount),
      viewCount: parseInt(channel.statistics.viewCount),
      accountAge,
      publishedAt: channel.snippet.publishedAt,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnailUrl: channel.snippet.thumbnails?.default?.url,
    };

    // Update the channel record in the database with the collected data
    const { error: updateError } = await supabase
      .from("channels")
      .update({
        // Basic channel information
        title: collectedData.title,
        thumbnails: { default: { url: collectedData.thumbnailUrl } },
        // YouTube statistics
        subscriber_count: collectedData.subscriberCount,
        video_count: collectedData.videoCount,
        view_count: collectedData.viewCount,
        account_age: collectedData.accountAge,
        published_at: collectedData.publishedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("channel_id", channelId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Database update error:", updateError);
      return NextResponse.json({
        error: "Failed to update channel data",
        details: updateError.message
      }, { status: 500 });
    }

    return NextResponse.json(collectedData);
  } catch (error) {
    console.error("Collect YouTube data error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
