"use client";

import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NeriaContainer from "./NeriaContainer";
import { NeriaProvider } from "./NeriaContext";
import DashboardContent from "./DashboardContent";

interface ClientDashboardLayoutProps {
  children: React.ReactNode;
  channelId?: string;
  showChannelSelector?: boolean;
  basePath?: string;
}

interface Channel {
  id: string;
  channel_id: string;
  title: string;
}

export default function ClientDashboardLayout({ 
  children, 
  channelId, 
  showChannelSelector = true,
  basePath = "/dashboard"
}: ClientDashboardLayoutProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const checkAuthAndFetchChannels = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/auth/signin");
        return;
      }

      setUser(user);

      const { data: channels } = await supabase
        .from("channels")
        .select("id, channel_id, title")
        .order("created_at", { ascending: true });

      // Redirect to onboard if user has no channels
      if (!channels || channels.length === 0) {
        router.push("/onboard");
        return;
      }

      setChannels(channels);
      setIsLoading(false);
    };

    checkAuthAndFetchChannels();
  }, [supabase, router]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const decodedChannelId = channelId ? decodeURIComponent(channelId) : undefined;

  return (
    <NeriaProvider>
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
