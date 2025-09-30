import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getValidAccessToken } from "@/utils/googleAuth";

/**
 * POST /api/early-metrics/collect
 * Cron job endpoint to collect pending early metrics
 * Called by Vercel Cron every 10-15 minutes
 */
export async function POST(request: Request) {
  try {
    // Verify this is a cron request (basic security)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    
    // Find all pending collections where scheduled_for <= now
    const { data: pendingCollections, error: fetchError } = await admin
      .from("video_early_metrics")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(50); // Process max 50 per run to avoid timeouts

    if (fetchError) {
      console.error("Error fetching pending collections:", fetchError);
      return NextResponse.json({ error: "Failed to fetch pending collections" }, { status: 500 });
    }

    if (!pendingCollections || pendingCollections.length === 0) {
      return NextResponse.json({ 
        message: "No pending collections",
        processed: 0 
      });
    }

    console.log(`[Early Metrics Cron] Processing ${pendingCollections.length} pending collections`);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Process each pending collection
    for (const collection of pendingCollections) {
      try {
        // Get access token for this user
        const tokenResult = await getValidAccessToken(
          collection.user_id, 
          collection.channel_id
        );

        if (!tokenResult.success) {
          throw new Error(tokenResult.error || "Failed to get access token");
        }

        const accessToken = tokenResult.accessToken;

        // Fetch video statistics from YouTube Data API
        const videoResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${collection.video_id}`,
          { 
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            } 
          }
        );

        if (!videoResponse.ok) {
          throw new Error(`YouTube API error: ${videoResponse.status}`);
        }

        const videoData = await videoResponse.json();
        const stats = videoData.items?.[0]?.statistics;

        if (!stats) {
          throw new Error("Video not found or no statistics available");
        }

        // Try to get watch time from YouTube Analytics API (may not be available yet)
        let estimatedMinutesWatched = null;
        let subscribersGained = null;
        
        try {
          const analyticsResponse = await fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?` +
            `ids=channel==${collection.channel_id}&` +
            `startDate=${collection.published_at.split('T')[0]}&` +
            `endDate=${new Date().toISOString().split('T')[0]}&` +
            `metrics=estimatedMinutesWatched,subscribersGained&` +
            `dimensions=video&` +
            `filters=video==${collection.video_id}`,
            { 
              headers: { 
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              } 
            }
          );

          if (analyticsResponse.ok) {
            const analyticsData = await analyticsResponse.json();
            const row = analyticsData.rows?.[0];
            if (row) {
              estimatedMinutesWatched = row[1];
              subscribersGained = row[2];
            }
          }
        } catch (analyticsError) {
          console.log(`[Early Metrics] Analytics not available for ${collection.video_id}:`, analyticsError);
          // This is expected for very new videos, don't fail the collection
        }

        // Update the record with collected metrics
        const { error: updateError } = await admin
          .from("video_early_metrics")
          .update({
            status: 'collected',
            views_3h: parseInt(stats.viewCount || '0'),
            likes_3h: parseInt(stats.likeCount || '0'),
            comments_3h: parseInt(stats.commentCount || '0'),
            estimated_minutes_watched_3h: estimatedMinutesWatched,
            subscribers_gained_3h: subscribersGained,
            collected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            error_message: null
          })
          .eq("id", collection.id);

        if (updateError) {
          throw updateError;
        }

        results.success++;
        console.log(`[Early Metrics] Collected for video ${collection.video_id}: ${stats.viewCount} views`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Early Metrics] Failed to collect for video ${collection.video_id}:`, error);
        
        // Mark as failed
        await admin
          .from("video_early_metrics")
          .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq("id", collection.id);

        results.failed++;
        results.errors.push(`${collection.video_id}: ${errorMessage}`);
      }
    }

    console.log(`[Early Metrics Cron] Complete: ${results.success} success, ${results.failed} failed`);

    return NextResponse.json({
      message: "Collection complete",
      processed: pendingCollections.length,
      ...results
    });

  } catch (error) {
    console.error("Early metrics collection cron error:", error);
    return NextResponse.json({ 
      error: "Internal error",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Allow GET for manual testing (requires same auth)
export async function GET(request: Request) {
  return POST(request);
}

