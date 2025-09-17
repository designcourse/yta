"use client";

import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NeriaContainer from "./NeriaContainer";
import { NeriaProvider } from "./NeriaContext";
import DashboardContent from "./DashboardContent";
import TestNotificationTrigger from "./TestNotificationTrigger";
import React from "react";

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
  const [notification, setNotification] = useState<any | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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

  // Fetch latest unread notification for this channel and show toast
  useEffect(() => {
    try {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchNotifications = async () => {
      try {
        const id = channelId ? decodeURIComponent(channelId) : undefined;
        if (!id) return;
        const res = await fetch(`/api/notifications?channelId=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const j = await res.json();
        const firstUnread = Array.isArray(j.notifications) ? j.notifications.find((n: any) => !n.is_read) : null;
        if (!cancelled) setNotification(firstUnread || null);
      } catch {}
    };

    // Support test notification injection
    const handleTestNotification = (e: any) => {
      if (e.detail && !cancelled) {
        setNotification(e.detail);
      }
    };
    window.addEventListener('test-inject-notification', handleTestNotification);

    fetchNotifications();
    const interval = window.setInterval(fetchNotifications, 60_000);
    return () => { 
      cancelled = true; 
      window.clearInterval(interval);
      window.removeEventListener('test-inject-notification', handleTestNotification);
    };
  }, [channelId]);

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

        {/* Test notification trigger (dev only) */}
        <TestNotificationTrigger />

        {/* Simple Notification Toast */}
        {notification && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] max-w-[600px] w-[92vw]"
            role="status"
            aria-live="polite"
          >
            <div
              className="rounded-lg shadow-xl border border-yellow-300 bg-yellow-50 text-black px-4 py-3"
              style={{ transition: prefersReducedMotion ? undefined : 'transform 200ms ease, opacity 200ms ease' }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{notification.title || 'Notification'}</div>
                  {notification.body && (
                    <div className="text-sm text-black/80 mt-0.5">{notification.body}</div>
                  )}
                  {notification.type === 'rescue_prompt' && (
                    <div className="text-xs text-black/70 mt-1">
                      VPH {notification?.metadata?.vph} vs P25 {notification?.metadata?.vph_p25} at ~{notification?.metadata?.hours_since}h.
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      className="text-xs px-3 py-1.5 rounded-md font-semibold"
                      style={{ backgroundColor: '#3086ff', color: '#fff' }}
                      onClick={async () => {
                        try {
                          // mark read first
                          await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notification.id, action: 'mark_read' }) });
                          setNotification(null);
                          // open Neria to Next Experiment context by focusing window and scrolling Neria if needed
                          // Navigate stays on the same page; Neria already loads Next Experiment for the current channel
                          const ev = new CustomEvent('open-next-experiment');
                          window.dispatchEvent(ev);
                        } catch {}
                      }}
                    >Open Next Experiment</button>
                    <button
                      className="text-xs px-3 py-1.5 rounded-md border border-black/20"
                      onClick={async () => {
                        try {
                          await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notification.id, action: 'dismiss' }) });
                          setNotification(null);
                        } catch {}
                      }}
                    >Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </NeriaProvider>
  );
}
