import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

/**
 * GET /api/early-metrics?channelId=xxx&videoId=yyy
 * Fetch early metrics for a specific video
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const videoId = searchParams.get('videoId');
    
    if (!channelId || !videoId) {
      return NextResponse.json({ 
        error: "channelId and videoId are required" 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: metrics, error } = await supabase
      .from("video_early_metrics")
      .select("*")
      .eq("user_id", user.id)
      .eq("channel_id", channelId)
      .eq("video_id", videoId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error("Error fetching early metrics:", error);
      return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
    }

    return NextResponse.json({ metrics: metrics || null });

  } catch (error) {
    console.error("Early metrics error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/early-metrics
 * Schedule early metrics collection for a new video
 * Body: { channelId, videoId, videoTitle, publishedAt }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelId, videoId, videoTitle, publishedAt } = body;
    
    if (!channelId || !videoId || !publishedAt) {
      return NextResponse.json({ 
        error: "channelId, videoId, and publishedAt are required" 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if user has active subscription
    const { data: subscription } = await supabase
      .from("channel_subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .eq("channel_id", channelId)
      .eq("status", "active")
      .single();

    if (!subscription) {
      return NextResponse.json({ 
        error: "Active subscription required for early metrics tracking" 
      }, { status: 403 });
    }

    // Calculate scheduled time (published_at + 3 hours)
    const publishedDate = new Date(publishedAt);
    const scheduledFor = new Date(publishedDate.getTime() + (3 * 60 * 60 * 1000));

    const admin = createSupabaseAdminClient();
    
    // Insert or update the scheduled collection
    const { data: scheduled, error } = await admin
      .from("video_early_metrics")
      .upsert({
        user_id: user.id,
        channel_id: channelId,
        video_id: videoId,
        video_title: videoTitle || null,
        published_at: publishedAt,
        scheduled_for: scheduledFor.toISOString(),
        status: 'pending',
        updated_at: new Date().toISOString()
      }, { 
        onConflict: 'user_id,channel_id,video_id',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (error) {
      console.error("Error scheduling early metrics:", error);
      return NextResponse.json({ error: "Failed to schedule collection" }, { status: 500 });
    }

    return NextResponse.json({ 
      scheduled,
      message: `Collection scheduled for ${scheduledFor.toISOString()}`
    });

  } catch (error) {
    console.error("Early metrics scheduling error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

