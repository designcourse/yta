"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface YouTubeChannel {
  id: string;
  snippet: {
    title: string;
    thumbnails: {
      default: { url: string };
    };
  };
}

export default function YouTubeChannelsPage() {
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchChannels() {
      try {
        const response = await fetch("/api/get-youtube-channels");
        const data = await response.json();
        
        if (response.ok) {
          setChannels(data.channels);
        } else {
          setError(data.error || "Failed to fetch channels");
        }
      } catch (err) {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }

    fetchChannels();
  }, []);

  const handleAddChannel = async (channelId: string) => {
    try {
      const response = await fetch("/api/add-youtube-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });

      if (response.ok) {
        // Notify parent window and close popup
        if (window.opener) {
          window.opener.postMessage("youtube-connected", "*");
        }
        window.close();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert("Failed to add channel");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Loading YouTube Channels</h2>
          <p className="text-sm opacity-80">Fetching your channels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p className="text-sm opacity-80 mb-4">{error}</p>
          <button 
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-500 text-white rounded"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Select YouTube Channel to Add</h1>
        
        {channels.length === 0 ? (
          <div className="text-center py-8">
            <p className="opacity-80">No YouTube channels found for your account.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((channel) => (
              <div 
                key={channel.id}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
                onClick={() => handleAddChannel(channel.id)}
              >
                <img 
                  src={channel.snippet.thumbnails.default.url}
                  alt={channel.snippet.title}
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <h3 className="font-medium">{channel.snippet.title}</h3>
                  <p className="text-sm opacity-60">Click to add this channel</p>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-6 text-center">
          <button 
            onClick={() => window.close()}
            className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
