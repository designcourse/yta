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

    // Delete all channel-related and user-related data
    if (userChannels && userChannels.length > 0) {
      const channelIds = userChannels.map(channel => channel.id);
      console.log(`🗑️ Deleting all data for ${channelIds.length} channels`);
      
      // Delete neria_context records
      const { error: neriaContextError } = await admin
        .from("neria_context")
        .delete()
        .in("channel_id", channelIds);
      if (neriaContextError) console.warn("⚠️ Error deleting neria_context:", neriaContextError);

      // Delete latest_video_snapshots
      const { error: videoSnapshotsError } = await admin
        .from("latest_video_snapshots")
        .delete()
        .in("channel_id", channelIds);
      if (videoSnapshotsError) console.warn("⚠️ Error deleting latest_video_snapshots:", videoSnapshotsError);

      // Delete stats_snapshots
      const { error: statsSnapshotsError } = await admin
        .from("stats_snapshots")
        .delete()
        .in("channel_id", channelIds);
      if (statsSnapshotsError) console.warn("⚠️ Error deleting stats_snapshots:", statsSnapshotsError);

      // Delete memory_profile
      const { error: memoryProfileError } = await admin
        .from("memory_profile")
        .delete()
        .in("channel_id", channelIds);
      if (memoryProfileError) console.warn("⚠️ Error deleting memory_profile:", memoryProfileError);

      // Delete channel_strategy
      const { error: channelStrategyError } = await admin
        .from("channel_strategy")
        .delete()
        .in("channel_id", channelIds);
      if (channelStrategyError) console.warn("⚠️ Error deleting channel_strategy:", channelStrategyError);

      // Delete channel_questions
      const { error: channelQuestionsError } = await admin
        .from("channel_questions")
        .delete()
        .in("channel_id", channelIds);
      if (channelQuestionsError) console.warn("⚠️ Error deleting channel_questions:", channelQuestionsError);

      // Delete collection_chunks
      const { error: collectionChunksError } = await admin
        .from("collection_chunks")
        .delete()
        .in("channel_id", channelIds);
      if (collectionChunksError) console.warn("⚠️ Error deleting collection_chunks:", collectionChunksError);

      // Delete memory_longterm
      const { error: memoryLongtermError } = await admin
        .from("memory_longterm")
        .delete()
        .in("channel_id", channelIds);
      if (memoryLongtermError) console.warn("⚠️ Error deleting memory_longterm:", memoryLongtermError);

      // Delete video_planner_ideas
      const { error: videoPlannerIdeasError } = await admin
        .from("video_planner_ideas")
        .delete()
        .in("channel_id", channelIds);
      if (videoPlannerIdeasError) console.warn("⚠️ Error deleting video_planner_ideas:", videoPlannerIdeasError);

      console.log("✅ Successfully deleted channel-related data");
    }

    // Delete all user-specific data (not channel-specific)
    
    // Delete chat_threads and their messages
    const { data: userThreads } = await admin
      .from("chat_threads")
      .select("id")
      .eq("user_id", user.id);

    if (userThreads && userThreads.length > 0) {
      const threadIds = userThreads.map(thread => thread.id);
      
      // Delete chat_messages first (foreign key constraint)
      const { error: messagesError } = await admin
        .from("chat_messages")
        .delete()
        .in("thread_id", threadIds);
      if (messagesError) console.warn("⚠️ Error deleting chat_messages:", messagesError);

      // Delete thread_summaries
      const { error: summariesError } = await admin
        .from("thread_summaries")
        .delete()
        .in("thread_id", threadIds);
      if (summariesError) console.warn("⚠️ Error deleting thread_summaries:", summariesError);
    }

    // Delete chat_threads
    const { error: threadsError } = await admin
      .from("chat_threads")
      .delete()
      .eq("user_id", user.id);
    if (threadsError) console.warn("⚠️ Error deleting chat_threads:", threadsError);

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
