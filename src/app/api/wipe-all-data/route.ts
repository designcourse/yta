import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    // First get all channel IDs for the user
    const { data: userChannels } = await admin
      .from("channels")
      .select("id")
      .eq("user_id", user.id);

    // Delete all neria_context records for the user's channels
    if (userChannels && userChannels.length > 0) {
      const channelIds = userChannels.map(channel => channel.id);
      console.log(`🗑️ Deleting neria_context records for ${channelIds.length} channels`);
      const { error: neriaContextError } = await admin
        .from("neria_context")
        .delete()
        .in("channel_id", channelIds);

      if (neriaContextError) {
        console.error("❌ Error deleting neria context:", neriaContextError);
        return NextResponse.json({
          error: "Failed to delete neria context",
          details: neriaContextError.message
        }, { status: 500 });
      } else {
        console.log("✅ Successfully deleted neria_context records");
      }
    } else {
      console.log("ℹ️ No channels found for user, skipping neria_context deletion");
    }

    // Delete all channels for the user
    const { error: channelsError } = await admin
      .from("channels")
      .delete()
      .eq("user_id", user.id);

    if (channelsError) {
      console.error("Error deleting channels:", channelsError);
      return NextResponse.json({
        error: "Failed to delete channels",
        details: channelsError.message
      }, { status: 500 });
    }

    // Delete all google_accounts for the user
    const { error: googleAccountsError } = await admin
      .from("google_accounts")
      .delete()
      .eq("user_id", user.id);

    if (googleAccountsError) {
      console.error("Error deleting google accounts:", googleAccountsError);
      return NextResponse.json({
        error: "Failed to delete google accounts",
        details: googleAccountsError.message
      }, { status: 500 });
    }

    // Sign out the user after wiping data
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      console.error("Error signing out user:", signOutError);
      // Don't fail the entire operation if sign out fails, but log it
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Wipe all data error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
