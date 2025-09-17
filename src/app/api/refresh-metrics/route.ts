import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";
import { aggregateYouTubeData } from "@/utils/youtube-aggregator";

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

    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) {
      return NextResponse.json({ error: token.error || "No YouTube access" }, { status: 400 });
    }

    console.log(`[refresh-metrics] Refreshing metrics for channel ${channelId}`);

    // Force fresh data aggregation
    const { neriaInput } = await aggregateYouTubeData({
      userId: user.id,
      channelId,
      accessToken: token.accessToken,
      refreshToken: undefined,
    });

    console.log(`[refresh-metrics] Refreshed ${neriaInput.recentUploads.length} videos for channel ${channelId}`);

    return NextResponse.json({ 
      success: true, 
      videosUpdated: neriaInput.recentUploads.length,
      message: "Metrics refreshed successfully" 
    });

  } catch (error) {
    console.error("Refresh metrics error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
