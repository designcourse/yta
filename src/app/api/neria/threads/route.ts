import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelIdParam = searchParams.get("channelId");
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    let query = supabase
      .from("chat_threads")
      .select("id, channel_id, title, created_at, updated_at, metadata")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (channelIdParam) {
      // Resolve external YouTube channel id to internal uuid if needed
      const { data: ch } = await supabase
        .from("channels")
        .select("id")
        .eq("user_id", user.id)
        .or(`id.eq.${channelIdParam},channel_id.eq.${channelIdParam}`)
        .limit(1)
        .maybeSingle();
      if (ch?.id) {
        query = query.eq("channel_id", ch.id);
      } else {
        // fall back later to most recent thread for this user
      }
    }

    let { data } = await query;
    if ((data || []).length === 0 && channelIdParam) {
      // Fallback: return most recent thread for user (to cover legacy threads without channel association)
      const { data: fallback } = await supabase
        .from("chat_threads")
        .select("id, channel_id, title, created_at, updated_at, metadata")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      data = fallback || [];
    }

    return NextResponse.json({ threads: data || [] });
  } catch (e: any) {
    console.error("List threads error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


