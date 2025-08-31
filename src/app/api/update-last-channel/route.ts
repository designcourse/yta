import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { channelId } = await request.json();

    if (!channelId) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    
    // Update the last_channel_used field in google_accounts table
    const { error } = await admin
      .from("google_accounts")
      .update({ last_channel_used: channelId })
      .eq("user_id", user.id);

    if (error) {
      console.error("Error updating last used channel:", error);
      return NextResponse.json({ error: "Failed to update last used channel" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in update-last-channel API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
