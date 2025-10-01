import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

// GET /api/videos/prepublish?planId={planId} OR ?videoId={videoId}
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId");
    const videoId = searchParams.get("videoId");
    
    if (!planId && !videoId) {
      return NextResponse.json({ error: "planId or videoId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Get the latest prepublish video for this plan or video
    let query = supabase
      .from("prepublish_videos")
      .select("id, status, error, uploaded_at, analyzed_at, plan_id, video_id, channel_id, version")
      .eq("user_id", user.id);
    
    if (planId) {
      query = query.eq("plan_id", planId);
    } else if (videoId) {
      query = query.eq("video_id", videoId);
    }

    const { data: video } = await query
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!video) {
      return NextResponse.json({ video: null });
    }

    // Get latest analysis if exists
    const { data: analysis } = await supabase
      .from("prepublish_analyses")
      .select("id, model, summary, analysis_json, transcript_json, created_at")
      .eq("prepublish_video_id", video.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ video, analysis: analysis || null });
  } catch (e) {
    console.error("[prepublish:get by planId/videoId] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
