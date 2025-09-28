import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const videoId = searchParams.get('videoId');
    
    if (!channelId || !videoId) {
      return NextResponse.json({ error: "Channel ID and Video ID are required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

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
      console.log(`[Video Bucket API] No bucket found for video ${videoId}:`, error);
      // Return null bucket info instead of failing
    }

    return NextResponse.json({
      bucket: bucketInfo
    });

  } catch (error) {
    console.error("Video bucket API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
