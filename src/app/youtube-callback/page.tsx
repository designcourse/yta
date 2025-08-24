"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function YouTubeCallbackPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Processing...");

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get("code");
      const originalUserId = searchParams.get("state"); // Get the original user ID

      if (!code) {
        setStatus("No authorization code received");
        return;
      }

      if (!originalUserId) {
        setStatus("No user ID received");
        return;
      }

      try {
        setStatus("Getting YouTube channels...");

        const response = await fetch("/api/youtube-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            originalUserId,
            redirectUri: `${window.location.origin}/youtube-callback`
          }),
        });

        if (response.ok) {
          const responseData = await response.json();
          const { channelIds } = responseData;

          setStatus("Success! Processing...");

          // Check if we're in a popup window
          const isPopup = window.opener && window.opener !== window;

          if (isPopup && window.opener) {
            // We're in a popup - notify parent with channel IDs and close
            window.opener.postMessage({
              type: "youtube-connected",
              channelIds: channelIds
            }, "*");
            setTimeout(() => window.close(), 1000);
          } else {
            // We're in the main window - redirect to collection page if we have channels
            if (channelIds && channelIds.length > 0) {
              setStatus("Success! Redirecting to data collection...");
              setTimeout(() => {
                window.location.href = `/dashboard/collection?channelId=${channelIds[0]}`;
              }, 2000);
            } else {
              setStatus("Success! Redirecting to dashboard...");
              setTimeout(() => {
                window.location.href = '/dashboard';
              }, 2000);
            }
          }
        } else {
          const error = await response.text();
          setStatus(`Error: ${error}`);
        }
      } catch (error) {
        setStatus(`Error: ${error}`);
      }
    }

    handleCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Connecting YouTube</h2>
        <p className="text-sm opacity-80">{status}</p>
      </div>
    </div>
  );
}
