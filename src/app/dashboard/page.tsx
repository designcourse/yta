import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const { data: channels } = await supabase
    .from("channels")
    .select("id, channel_id, title")
    .order("created_at", { ascending: true });

  // Redirect to onboard if user has no channels
  if (!channels || channels.length === 0) {
    redirect("/onboard");
  }

  // Get the last used channel from google_accounts table
  const admin = createSupabaseAdminClient();
  const { data: googleAccount } = await admin
    .from("google_accounts")
    .select("last_channel_used")
    .eq("user_id", user.id)
    .single();

  let targetChannelId = googleAccount?.last_channel_used;

  // If no last used channel or it doesn't exist in current channels, use the first channel
  if (!targetChannelId || !channels.find(c => c.channel_id === targetChannelId)) {
    targetChannelId = channels[0].channel_id;
    
    // Update the last_channel_used in the database
    await admin
      .from("google_accounts")
      .update({ last_channel_used: targetChannelId })
      .eq("user_id", user.id);
  }

  // Redirect to the last used channel's latest-video page
  redirect(`/dashboard/${encodeURIComponent(targetChannelId)}/latest-video`);
}
