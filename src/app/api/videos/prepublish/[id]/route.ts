import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

// GET /api/videos/prepublish/[id]
export async function GET(request: Request, context: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Next.js 15 requires awaiting params when provided as a promise
    // Support both sync and async shapes for compatibility
    // @ts-ignore-next-line
    const p: any = (context as any)?.params;
    const resolved = typeof p?.then === 'function' ? await p : p;
    const id = resolved?.id;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Enforce RLS by selecting as the user
    const { data: video } = await supabase
      .from("prepublish_videos")
      .select("id, status, error, uploaded_at, analyzed_at, plan_id, channel_id, version")
      .eq("id", id)
      .maybeSingle();
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: latest } = await supabase
      .from("prepublish_analyses")
      .select("id, model, summary, analysis_json, transcript_json, created_at")
      .eq("prepublish_video_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ video, analysis: latest || null });
  } catch (e) {
    console.error("[prepublish:get] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


