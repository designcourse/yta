import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

// GET /api/videos/prepublish?planId={planId}
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId");
    
    if (!planId) {
      return NextResponse.json({ error: "planId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Get the latest prepublish video for this plan
    const { data: video } = await supabase
      .from("prepublish_videos")
      .select("id, status, error, uploaded_at, analyzed_at, plan_id, channel_id, version")
      .eq("plan_id", planId)
      .eq("user_id", user.id)
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
    console.error("[prepublish:get by planId] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
