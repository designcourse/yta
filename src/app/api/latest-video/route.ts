import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { assignVideoToBucket, VideoForClustering } from "@/utils/bucket-classifier";
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
        // Get bucket information for cached video
        let cachedBucketInfo = null;
        try {
          const { data: bucketData } = await admin
            .from('video_metrics')
            .select(`
              bucket_id,
              content_buckets!inner (
                bucket_key,
                label,
                description
              )
            `)
            .eq('user_id', user.id)
            .eq('channel_id', channelId)
            .eq('video_id', existingSnapshot.video_id)
            .single();

          if (bucketData?.content_buckets) {
            cachedBucketInfo = {
              id: bucketData.bucket_id,
              key: bucketData.content_buckets.bucket_key,
              label: bucketData.content_buckets.label,
              description: bucketData.content_buckets.description
            };
          }
        } catch (error) {
          console.log(`[Bucket Info] No bucket found for cached video ${existingSnapshot.video_id}:`, error);
        }

        return NextResponse.json({
          video: existingSnapshot,
          bucket: cachedBucketInfo,
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

    // Check if this is a new video that needs 3h metrics scheduling
    try {
      const { data: existingMetric } = await admin
        .from("video_early_metrics")
        .select("id")
        .eq("user_id", user.id)
        .eq("channel_id", channelId)
        .eq("video_id", videoId)
        .single();

      // If no early metrics record exists, schedule collection
      if (!existingMetric) {
        const publishedDate = new Date(videoStats.snippet.publishedAt);
        const scheduledFor = new Date(publishedDate.getTime() + (3 * 60 * 60 * 1000));
        const now = new Date();

        // Only schedule if the 3h mark hasn't passed yet
        if (scheduledFor > now) {
          console.log(`[Early Metrics] Scheduling collection for new video ${videoId} at ${scheduledFor.toISOString()}`);
          
          // Check if user has active subscription
          const { data: subscription } = await admin
            .from("channel_subscriptions")
            .select("status")
            .eq("user_id", user.id)
            .eq("channel_id", channelId)
            .eq("status", "active")
            .single();

          if (subscription) {
            await admin
              .from("video_early_metrics")
              .insert({
                user_id: user.id,
                channel_id: channelId,
                video_id: videoId,
                video_title: videoStats.snippet.title,
                published_at: videoStats.snippet.publishedAt,
                scheduled_for: scheduledFor.toISOString(),
                status: 'pending'
              });
            
            console.log(`[Early Metrics] Scheduled collection for ${videoId}`);
          } else {
            console.log(`[Early Metrics] Skipping - no active subscription for channel ${channelId}`);
          }
        } else {
          console.log(`[Early Metrics] Video ${videoId} published > 3h ago, collecting immediately`);
          
          // 3h mark has passed, collect immediately
          try {
            const statsForEarly = {
              views_3h: parseInt(videoStats.statistics.viewCount || '0'),
              likes_3h: parseInt(videoStats.statistics.likeCount || '0'),
              comments_3h: parseInt(videoStats.statistics.commentCount || '0')
            };

            await admin
              .from("video_early_metrics")
              .insert({
                user_id: user.id,
                channel_id: channelId,
                video_id: videoId,
                video_title: videoStats.snippet.title,
                published_at: videoStats.snippet.publishedAt,
                scheduled_for: scheduledFor.toISOString(),
                status: 'collected',
                ...statsForEarly,
                collected_at: new Date().toISOString()
              });
            
            console.log(`[Early Metrics] Immediately collected for ${videoId}`);
          } catch (collectError) {
            console.error(`[Early Metrics] Failed to collect immediately:`, collectError);
          }
        }
      }
    } catch (scheduleError) {
      console.error(`[Early Metrics] Failed to schedule/collect:`, scheduleError);
      // Don't fail the entire request if early metrics scheduling fails
    }

    // Get bucket information for this video
    let bucketInfo = null;
    try {
      const { data: bucketData } = await admin
        .from('video_metrics')
        .select(`
          bucket_id,
          content_buckets!inner (
            bucket_key,
            label,
            description
          )
        `)
        .eq('user_id', user.id)
        .eq('channel_id', channelId)
        .eq('video_id', videoId)
        .single();

      if (bucketData?.content_buckets) {
        bucketInfo = {
          id: bucketData.bucket_id,
          key: bucketData.content_buckets.bucket_key,
          label: bucketData.content_buckets.label,
          description: bucketData.content_buckets.description
        };
      }
    } catch (error) {
      console.log(`[Bucket Info] No bucket found for video ${videoId}:`, error);
      // Don't fail the request if bucket info is missing
    }

    // Check if this is a new video that needs bucket assignment
    try {
      const { data: existingMetric } = await admin
        .from('video_metrics')
        .select('bucket_id')
        .eq('user_id', user.id)
        .eq('channel_id', channelId)
        .eq('video_id', videoId)
        .single();

      // If video doesn't exist in metrics or has no bucket assigned, assign it
      if (!existingMetric || !existingMetric.bucket_id) {
        console.log(`[Bucket Assignment] Assigning bucket for new video: ${videoId}`);
        
        const videoForClassification: VideoForClustering = {
          id: videoId,
          title: videoStats.snippet.title || '',
          description: videoStats.snippet.description || '',
          publishedAt: videoStats.snippet.publishedAt,
          durationSec: undefined, // We don't have duration in this context
        };

        await assignVideoToBucket(user.id, channelId, videoForClassification);
        console.log(`[Bucket Assignment] Successfully assigned bucket for video: ${videoId}`);
      }
    } catch (error) {
      console.error(`[Bucket Assignment] Failed to assign bucket for video ${videoId}:`, error);
      // Don't fail the entire request if bucket assignment fails
    }

    return NextResponse.json({
      video: snapshot,
      bucket: bucketInfo,
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
