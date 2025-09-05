"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

export default function YouTubeConnectPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    async function getCurrentUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Please sign in first");
        window.close();
        return;
      }
      setCurrentUserId(user.id);
    }
    getCurrentUser();
  }, [supabase]);

  useEffect(() => {
    if (!currentUserId) return;

    // Using your Google Client ID from the screenshot
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "5489903736-euc1v8ficip96b4d7jbc07ib34h7hl9e.apps.googleusercontent.com";
    
    if (!clientId) {
      alert("Google Client ID not configured");
      return;
    }
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${window.location.origin}/youtube-callback`,
      response_type: "code",
      // Add youtube.force-ssl to allow authorized captions download (captions.list/download)
      scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: currentUserId, // Pass the current user ID
    });

    // Redirect to Google OAuth
    window.location.href = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
  }, [currentUserId]);

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Connecting to YouTube</h2>
        <p className="text-sm opacity-80">Redirecting to Google...</p>
      </div>
    </div>
  );
}
