"use client";

import RefreshContainer from "@/components/RefreshContainer";
import LastVideoContainer from "@/components/LastVideoContainer";
import { useEffect, useState } from "react";

interface VideoData {
  video_id: string;
  video_title: string;
  thumbnail_url: string;
  view_count: number;
  comment_count: number;
  published_at: string;
  stats_retrieved_at: string;
}

export default function LatestVideoClient({ channelId }: { channelId: string }) {
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContainer, setShowContainer] = useState(false);

  useEffect(() => {
    if (channelId) {
      fetchLatestVideo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const fetchLatestVideo = async (forceRefresh = false) => {
    if (!channelId) return;

    setIsLoading(true);
    setError(null);

    try {
      let response;
      if (forceRefresh) {
        response = await fetch('/api/latest-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId }),
        });
      } else {
        response = await fetch(`/api/latest-video?channelId=${channelId}`);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch latest video');
      }

      const data = await response.json();
      setVideoData(data.video);
      setTimeout(() => setShowContainer(true), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching latest video:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    setShowContainer(false);
    fetchLatestVideo(true);
  };

  return (
    <div className="space-y-6">
      <RefreshContainer 
        lastUpdated={videoData?.stats_retrieved_at}
        onRefresh={handleRefresh}
        isLoading={isLoading}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {videoData && (
        <div 
          className={`transition-all duration-700 ease-out ${
            showContainer 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-12'
          }`}
        >
          <LastVideoContainer videoData={videoData} />
        </div>
      )}
    </div>
  );
}


