import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if user has any channels
    const { data: channels } = await supabase
      .from("channels")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    const hasChannels = channels && channels.length > 0;

    return NextResponse.json({
      hasChannels,
      channelCount: channels?.length || 0
    });
  } catch (error) {
    console.error("Check user channels error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
