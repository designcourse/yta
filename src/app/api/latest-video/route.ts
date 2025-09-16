import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getValidAccessToken } from "@/utils/googleAuth";

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

    // First, get the internal channel UUID from the channels table
    const { data: channelData, error: channelError } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError || !channelData) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const internalChannelId = channelData.id;

    // Check if we already have a recent snapshot (within last hour)
    const admin = createSupabaseAdminClient();
    const { data: existingSnapshot } = await admin
      .from("latest_video_snapshots")
      .select("*")
      .eq("channel_id", internalChannelId)
      .eq("user_id", user.id)
      .single();

    // If we have a recent snapshot (less than 30 minutes old), return it
    if (existingSnapshot) {
      const statsAge = Date.now() - new Date(existingSnapshot.stats_retrieved_at).getTime();
      const thirtyMinutes = 30 * 60 * 1000;
      
      if (statsAge < thirtyMinutes) {
        return NextResponse.json({
          video: existingSnapshot,
          fromCache: true
        });
      }
    }

    // Get fresh data from YouTube API
    const tokenResult = await getValidAccessToken(user.id, channelId);

    if (!tokenResult.success) {
      return NextResponse.json({ 
        error: tokenResult.error || "No Google access token found"
      }, { status: 400 });
    }

    const accessToken = tokenResult.accessToken;

    // Resolve uploads playlist and get the latest upload via playlistItems.list (cheap)
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (!channelRes.ok) {
      const error = await channelRes.text();
      console.error("YouTube channels.list failed:", error);
      return NextResponse.json({ error: "Failed to fetch channel details" }, { status: 500 });
    }
    const channelJson = await channelRes.json();
    const uploadsPlaylistId = channelJson?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return NextResponse.json({ error: "Uploads playlist not found for channel" }, { status: 404 });
    }

    const playlistItemsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (!playlistItemsRes.ok) {
      const error = await playlistItemsRes.text();
      console.error("YouTube playlistItems.list failed:", error);
      return NextResponse.json({ error: "Failed to fetch latest upload" }, { status: 500 });
    }
    const playlistItemsJson = await playlistItemsRes.json();
    const items: any[] = Array.isArray(playlistItemsJson?.items) ? playlistItemsJson.items : [];
    const ids: string[] = items.map((it: any) => it?.contentDetails?.videoId || it?.snippet?.resourceId?.videoId).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: "No videos found for this channel" }, { status: 404 });
    }

    // Fetch statuses and pick the most recent public video
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${ids.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!videosRes.ok) {
      const t = await videosRes.text();
      console.error("YouTube videos.list(status) failed:", t);
      return NextResponse.json({ error: "Failed to resolve video statuses" }, { status: 500 });
    }
    const vjson = await videosRes.json();
    const publicVideos = (vjson.items || []).filter((v: any) => (v?.status?.privacyStatus || 'public') === 'public');
    if (publicVideos.length === 0) {
      return NextResponse.json({ error: "No public videos found" }, { status: 404 });
    }
    publicVideos.sort((a: any, b: any) => new Date(b?.snippet?.publishedAt || 0).getTime() - new Date(a?.snippet?.publishedAt || 0).getTime());
    const chosen = publicVideos[0];
    const videoId = chosen?.id as string;

    // Get video statistics
    const videoResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}`,
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    if (!videoResponse.ok) {
      const error = await videoResponse.text();
      console.error("YouTube Videos API failed:", error);
      return NextResponse.json({ error: "Failed to fetch video statistics" }, { status: 500 });
    }

    const videoData = await videoResponse.json();
    const videoStats = videoData.items?.[0];

    if (!videoStats) {
      return NextResponse.json({ error: "Video statistics not found" }, { status: 404 });
    }

    // Prepare the snapshot data
    const snapshotData = {
      channel_id: internalChannelId,
      user_id: user.id,
      video_id: videoId,
      video_title: videoStats.snippet.title,
      thumbnail_url: videoStats.snippet.thumbnails.high.url,
      view_count: parseInt(videoStats.statistics.viewCount || '0'),
      comment_count: parseInt(videoStats.statistics.commentCount || '0'),
      published_at: videoStats.snippet.publishedAt,
      stats_retrieved_at: new Date().toISOString()
    };

    // Insert or update the snapshot
    const { data: snapshot, error: snapshotError } = await admin
      .from("latest_video_snapshots")
      .upsert(snapshotData, { onConflict: 'channel_id' })
      .select()
      .single();

    if (snapshotError) {
      console.error("Error saving snapshot:", snapshotError);
      return NextResponse.json({ error: "Failed to save video snapshot" }, { status: 500 });
    }

    return NextResponse.json({
      video: snapshot,
      fromCache: false
    });

  } catch (error) {
    console.error("Latest video error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { channelId } = await request.json();
    
    if (!channelId) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the internal channel UUID from the channels table
    const { data: channelData, error: channelError } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError || !channelData) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const internalChannelId = channelData.id;

    // Force refresh by calling GET with fresh data
    const url = new URL(request.url);
    url.searchParams.set('channelId', channelId);
    
    // Delete existing snapshot to force fresh fetch
    const admin = createSupabaseAdminClient();
    await admin
      .from("latest_video_snapshots")
      .delete()
      .eq("channel_id", internalChannelId)
      .eq("user_id", user.id);

    // Now fetch fresh data
    const freshRequest = new Request(url.toString());
    return await GET(freshRequest);

  } catch (error) {
    console.error("Latest video refresh error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
