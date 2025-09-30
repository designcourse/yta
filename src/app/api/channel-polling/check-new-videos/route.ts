import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getValidAccessToken } from "@/utils/googleAuth";

/**
 * POST /api/channel-polling/check-new-videos
 * Cron job endpoint to check for new videos on all subscribed channels
 * Runs hourly to catch new uploads before the 3h window expires
 */
export async function POST(request: Request) {
  try {
    // Verify this is a cron request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    
    // Get all active subscriptions
    const { data: subscriptions, error: subError } = await admin
      .from("channel_subscriptions")
      .select("user_id, channel_id")
      .eq("status", "active");

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ 
        message: "No active subscriptions",
        checked: 0 
      });
    }

    console.log(`[Channel Polling] Checking ${subscriptions.length} subscribed channels for new videos`);

    const results = {
      totalChannels: subscriptions.length,
      checked: 0,
      newVideosFound: 0,
      scheduled: 0,
      backfilled: 0,
      alreadyTracked: 0,
      channelDetails: [] as Array<{
        channelId: string;
        status: string;
        videoId?: string;
        videoTitle?: string;
        publishedAt?: string;
        action?: string;
        hoursOld?: number;
      }>,
      errors: [] as string[]
    };

    // Process each subscribed channel
    for (const sub of subscriptions) {
      try {
        const channelId = sub.channel_id;
        const userId = sub.user_id;

        // Get access token
        const tokenResult = await getValidAccessToken(userId, channelId);
        if (!tokenResult.success) {
          results.channelDetails.push({
            channelId,
            status: 'error',
            action: 'No access token'
          });
          results.errors.push(`${channelId}: No access token`);
          continue;
        }

        const accessToken = tokenResult.accessToken;

        // Fetch channel's uploads playlist
        const channelRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!channelRes.ok) {
          results.channelDetails.push({
            channelId,
            status: 'error',
            action: 'Channel fetch failed'
          });
          results.errors.push(`${channelId}: Channel fetch failed`);
          continue;
        }

        const channelData = await channelRes.json();
        const uploadsPlaylistId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

        if (!uploadsPlaylistId) {
          results.channelDetails.push({
            channelId,
            status: 'error',
            action: 'No uploads playlist'
          });
          results.errors.push(`${channelId}: No uploads playlist`);
          continue;
        }

        // Get latest video from playlist (just the most recent one)
        const playlistRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=1`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!playlistRes.ok) {
          results.channelDetails.push({
            channelId,
            status: 'error',
            action: 'Playlist fetch failed'
          });
          results.errors.push(`${channelId}: Playlist fetch failed`);
          continue;
        }

        const playlistData = await playlistRes.json();
        const items = playlistData?.items || [];

        if (items.length === 0) {
          results.checked++;
          results.channelDetails.push({
            channelId,
            status: 'no_videos',
            action: 'Channel has no videos'
          });
          continue;
        }

        const latestVideo = items[0];
        const videoId = latestVideo.contentDetails?.videoId;
        const publishedAt = latestVideo.snippet?.publishedAt;
        const videoTitle = latestVideo.snippet?.title;

        if (!videoId || !publishedAt) {
          results.channelDetails.push({
            channelId,
            status: 'error',
            action: 'Invalid video data'
          });
          results.errors.push(`${channelId}: Invalid video data`);
          continue;
        }

        results.checked++;
        
        const publishedDate = new Date(publishedAt);
        const hoursOld = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60);

        // Check if we already have a record for this video
        const { data: existingMetric } = await admin
          .from("video_early_metrics")
          .select("id")
          .eq("user_id", userId)
          .eq("channel_id", channelId)
          .eq("video_id", videoId)
          .single();

        if (existingMetric) {
          // Already scheduled or collected
          results.alreadyTracked++;
          results.channelDetails.push({
            channelId,
            videoId,
            videoTitle,
            publishedAt,
            status: 'already_tracked',
            action: 'Video already in database',
            hoursOld: Math.round(hoursOld * 10) / 10
          });
          continue;
        }

        // Check if video is still within the schedulable window (< 3 hours old)
        const scheduledFor = new Date(publishedDate.getTime() + (3 * 60 * 60 * 1000));
        const now = new Date();

        if (scheduledFor > now) {
          // New video found! Schedule 3h collection
          console.log(`[Channel Polling] New video found: ${videoId} - scheduling 3h collection`);

          await admin
            .from("video_early_metrics")
            .insert({
              user_id: userId,
              channel_id: channelId,
              video_id: videoId,
              video_title: videoTitle,
              published_at: publishedAt,
              scheduled_for: scheduledFor.toISOString(),
              status: 'pending'
            });

          results.newVideosFound++;
          results.scheduled++;
          results.channelDetails.push({
            channelId,
            videoId,
            videoTitle,
            publishedAt,
            status: 'new_video_scheduled',
            action: `Scheduled for 3h collection (${Math.round((scheduledFor.getTime() - now.getTime()) / (1000 * 60))} min from now)`,
            hoursOld: Math.round(hoursOld * 10) / 10
          });
        } else {
          // Video is >3h old, collect immediately with backfill flag
          console.log(`[Channel Polling] Video ${videoId} is >3h old - collecting now as backfill`);

          // Fetch current stats
          const videoRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (videoRes.ok) {
            const videoData = await videoRes.json();
            const stats = videoData.items?.[0]?.statistics;

            if (stats) {
              await admin
                .from("video_early_metrics")
                .insert({
                  user_id: userId,
                  channel_id: channelId,
                  video_id: videoId,
                  video_title: videoTitle,
                  published_at: publishedAt,
                  scheduled_for: scheduledFor.toISOString(),
                  status: 'collected',
                  views_3h: parseInt(stats.viewCount || '0'),
                  likes_3h: parseInt(stats.likeCount || '0'),
                  comments_3h: parseInt(stats.commentCount || '0'),
                  collected_at: now.toISOString(),
                  error_message: 'Late capture - video discovered after 3h mark'
                });

              results.newVideosFound++;
              results.scheduled++;
              results.backfilled++;
              results.channelDetails.push({
                channelId,
                videoId,
                videoTitle,
                publishedAt,
                status: 'backfilled',
                action: `Collected as backfill (${Math.round(hoursOld * 10) / 10}h old)`,
                hoursOld: Math.round(hoursOld * 10) / 10
              });
            }
          }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Channel Polling] Failed for channel:`, error);
        results.channelDetails.push({
          channelId: sub.channel_id,
          status: 'error',
          action: `Exception: ${errorMessage}`
        });
        results.errors.push(`${sub.channel_id}: ${errorMessage}`);
      }
    }

    console.log(`[Channel Polling] Complete: checked ${results.checked}, found ${results.newVideosFound} new videos`);

    return NextResponse.json({
      success: true,
      message: `Polling complete: ${results.totalChannels} channels processed`,
      summary: {
        totalChannels: results.totalChannels,
        checkedSuccessfully: results.checked,
        newVideosFound: results.newVideosFound,
        scheduled: results.scheduled - results.backfilled,
        backfilled: results.backfilled,
        alreadyTracked: results.alreadyTracked,
        errors: results.errors.length
      },
      details: results.channelDetails,
      errors: results.errors
    });

  } catch (error) {
    console.error("Channel polling error:", error);
    return NextResponse.json({ 
      error: "Internal error",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Allow GET for manual testing
export async function GET(request: Request) {
  return POST(request);
}
