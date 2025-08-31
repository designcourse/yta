import { createSupabaseServerClient } from "@/utils/supabase/server";
import DashboardSidebar from "./DashboardSidebar";
import ChannelSelector from "./ChannelSelector";
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
    <div className="min-h-screen dashboard-layout" style={{ backgroundColor: '#E6E8FC' }}>
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
      
      {/* Container with 77% width minus sidebar */}
      <div className="ml-[213px] flex" style={{ width: 'calc(77% - 213px)' }}>
        {/* Sidebar - Fixed width */}
        <DashboardSidebar 
          channels={channels} 
          currentChannelId={decodedChannelId}
        />

        {/* Main Content Area */}
        <div className="flex-1 ml-[20px]">
          {/* Header with Channel Selector */}
          {showChannelSelector && (
            <header className="h-[104px] flex items-center justify-end px-5">
              <ChannelSelector 
                channels={channels}
                currentChannelId={decodedChannelId}
                basePath={basePath}
              />
            </header>
          )}

          {/* Main Content */}
          <main className={`px-5 ${showChannelSelector ? 'pt-12' : 'pt-20'}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
