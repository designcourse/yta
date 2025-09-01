import { createSupabaseServerClient } from "@/utils/supabase/server";
import NeriaContainer from "./NeriaContainer";
import { NeriaProvider } from "./NeriaContext";
import DashboardContent from "./DashboardContent";
import { redirect } from "next/navigation";

interface DashboardLayoutProps {
  children: React.ReactNode;
  channelId?: string;
  showChannelSelector?: boolean;
  basePath?: string;
}

export default async function DashboardLayout({ 
  children, 
  channelId, 
  showChannelSelector = true,
  basePath = "/dashboard"
}: DashboardLayoutProps) {
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

  const decodedChannelId = channelId ? decodeURIComponent(channelId) : undefined;

  return (
    <NeriaProvider>
      <div className="min-h-screen dashboard-layout overflow-hidden" style={{ backgroundColor: '#E6E8FC' }}>
        {/* Hide spline canvas */}
        <style dangerouslySetInnerHTML={{
          __html: `
            .dashboard-layout ~ * canvas,
            body canvas {
              display: none !important;
            }
            body {
              background-color: #E6E8FC !important;
            }
          `
        }} />
        
        {/* Container with adjusted width to account for Neria Container */}
        <DashboardContent
          channels={channels}
          currentChannelId={decodedChannelId}
          showChannelSelector={showChannelSelector}
          basePath={basePath}
        >
          {children}
        </DashboardContent>

        {/* Neria Container - Fixed right aligned */}
        <NeriaContainer />
      </div>
    </NeriaProvider>
  );
}
