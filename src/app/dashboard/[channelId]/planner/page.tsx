'use client';

import { useState, useEffect, useCallback } from 'react';
import ClientDashboardLayout from "@/components/ClientDashboardLayout";

interface VideoIdeaData {
  id: string;
  title: string;
  position: number;
  selected: boolean;
  created_at: string;
}

interface ChannelData {
  title: string;
  thumbnails: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
    standard?: { url: string };
    maxres?: { url: string };
  };
}

export default function PlannerPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const [channelId, setChannelId] = useState<string>("");
  const [videoIdeas, setVideoIdeas] = useState<VideoIdeaData[]>([]);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    params.then(resolvedParams => {
      setChannelId(resolvedParams.channelId);
    });
  }, [params]);

  const fetchChannelData = useCallback(async () => {
    if (!channelId) return;
    
    try {
      // Get channel data from our database via the new API
      const response = await fetch(`/api/channel-info?channelId=${encodeURIComponent(channelId)}`);
      if (response.ok) {
        const data = await response.json();
        setChannelData({
          title: data.channel.title || 'DesignCourse',
          thumbnails: data.channel.thumbnails || {}
        });
        return;
      }
      
      // If API call fails, check the error
      if (response.status === 404) {
        console.log('Channel not found in database, using fallback');
      } else {
        console.error('API error:', response.status);
      }
      
      // Fallback data
      setChannelData({
        title: 'DesignCourse',
        thumbnails: {}
      });
    } catch (err) {
      console.error('Error fetching channel data:', err);
      // Set fallback data
      setChannelData({
        title: 'DesignCourse',
        thumbnails: {}
      });
    }
  }, [channelId]);

  const fetchVideoIdeas = useCallback(async (forceRefresh = false) => {
    if (!channelId) return;

    setIsLoading(true);
    setError(null);

    try {
      let response;
      if (forceRefresh) {
        // Use POST for refresh
        response = await fetch('/api/video-planner-ideas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channelId }),
        });
      } else {
        // Use GET for normal fetch
        response = await fetch(`/api/video-planner-ideas?channelId=${channelId}`);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch video ideas');
      }

      const data = await response.json();
      setVideoIdeas(data.ideas || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching video ideas:', err);
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (channelId) {
      fetchChannelData();
      fetchVideoIdeas();
    }
  }, [channelId, fetchChannelData, fetchVideoIdeas]);

  // Listen for video ideas generated from Neria chat
  useEffect(() => {
    const handleVideoIdeasGenerated = (event: CustomEvent) => {
      console.log('Video ideas generated via chat:', event.detail.message);
      // Refresh the video ideas
      fetchVideoIdeas();
    };

    window.addEventListener('video-ideas-generated', handleVideoIdeasGenerated as EventListener);
    
    return () => {
      window.removeEventListener('video-ideas-generated', handleVideoIdeasGenerated as EventListener);
    };
  }, [fetchVideoIdeas]);

  const handleGenerateMore = async () => {
    setGenerating(true);
    await fetchVideoIdeas(true);
    setGenerating(false);
  };

  const handleCardClick = (ideaId: string) => {
    // TODO: Handle card selection and navigate to next step
    console.log('Selected idea:', ideaId);
  };

  const getChannelAvatar = () => {
    if (!channelData?.thumbnails) return null;
    
    // Try different quality levels in order of preference
    const thumbnails = channelData.thumbnails;
    
    // High quality first
    if (thumbnails.high?.url) {
      return thumbnails.high.url;
    }
    
    // Medium quality
    if (thumbnails.medium?.url) {
      return thumbnails.medium.url;
    }
    
    // Default quality
    if (thumbnails.default?.url) {
      return thumbnails.default.url;
    }
    
    // Sometimes YouTube API returns different property names
    if (thumbnails.maxres?.url) {
      return thumbnails.maxres.url;
    }
    
    if (thumbnails.standard?.url) {
      return thumbnails.standard.url;
    }
    
    return null;
  };

  if (!channelId) {
    return <div>Loading...</div>;
  }

  return (
    <ClientDashboardLayout 
      channelId={channelId}
      basePath="/dashboard/[channelId]/planner"
    >
      <div className="space-y-15">
        {/* Generate More CTA */}
        <button 
          onClick={handleGenerateMore}
          disabled={generating}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          <svg className={`w-5 h-5 ${generating ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none">
            <path 
              d="M12 2V6M12 18V22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[22px] text-gray-900">
            {generating ? 'Generating...' : 'Generate more'}
          </span>
        </button>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && videoIdeas.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="text-gray-600">Generating video title ideas...</span>
            </div>
          </div>
        )}

        {/* Video Ideas Cards */}
        {videoIdeas.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
            {videoIdeas.map((idea) => (
              <button
                key={idea.id}
                onClick={() => handleCardClick(idea.id)}
                className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left"
                style={{ minWidth: '300px' }}
              >
                {/* Thumbnail Image */}
                <div className="w-full h-[221px] flex items-center justify-center" style={{ backgroundColor: '#D7D9F2' }}>
                  <span className="text-gray-500">Thumbnail Preview</span>
                </div>

                {/* Card Content */}
                <div className="p-4 flex items gap-4">
                  {/* Channel Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
                    {getChannelAvatar() ? (
                      <img 
                        src={getChannelAvatar()!} 
                        alt={`${channelData?.title} avatar`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                        <span className="text-white font-medium text-sm">
                          {channelData?.title?.charAt(0) || '?'}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Info Container */}
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900 mb-1 leading-tight min-h-[2.5rem] flex items-start">
                      <span className="line-clamp-2">
                        {idea.title}
                      </span>
                    </h3>
                    <p className="text-base text-gray-600">
                      {channelData?.title || 'DesignCourse'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && videoIdeas.length === 0 && !error && (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No video ideas generated yet.</p>
            <button
              onClick={handleGenerateMore}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none">
                <path 
                  d="M12 2V6M12 18V22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round"
                />
              </svg>
              {generating ? 'Generating...' : 'Generate Ideas'}
            </button>
          </div>
        )}
      </div>
    </ClientDashboardLayout>
  );
}
