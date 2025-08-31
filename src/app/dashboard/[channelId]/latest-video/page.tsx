"use client";

import ClientDashboardLayout from "@/components/ClientDashboardLayout";
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

interface LatestVideoPageProps {
  params: Promise<{ channelId: string }>;
}

export default function LatestVideoPage({ params }: LatestVideoPageProps) {
  const [channelId, setChannelId] = useState<string>("");
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(resolvedParams => {
      setChannelId(resolvedParams.channelId);
    });
  }, [params]);

  useEffect(() => {
    if (channelId) {
      fetchLatestVideo();
    }
  }, [channelId]);

  const fetchLatestVideo = async (forceRefresh = false) => {
    if (!channelId) return;

    setIsLoading(true);
    setError(null);

    try {
      let response;
      if (forceRefresh) {
        // Use POST for refresh
        response = await fetch('/api/latest-video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channelId }),
        });
      } else {
        // Use GET for normal fetch
        response = await fetch(`/api/latest-video?channelId=${channelId}`);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch latest video');
      }

      const data = await response.json();
      setVideoData(data.video);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching latest video:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchLatestVideo(true);
  };

  if (!channelId) {
    return <div>Loading...</div>;
  }

  return (
    <ClientDashboardLayout 
      channelId={channelId}
      basePath="/dashboard/[channelId]/latest-video"
    >
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
        
        <LastVideoContainer videoData={videoData || undefined} />
      </div>
    </ClientDashboardLayout>
  );
}
