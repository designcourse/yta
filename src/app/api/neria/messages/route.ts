import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");
    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Ensure thread belongs to user
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

    const { data: messages } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    return NextResponse.json({ messages: messages || [] });
  } catch (e: any) {
    console.error("List messages error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


