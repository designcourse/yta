'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RefreshContainer from "@/components/RefreshContainer";

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

export default function PlannerClient({ channelId }: { channelId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [videoIdeas, setVideoIdeas] = useState<VideoIdeaData[]>([]);
  const [savedPlans, setSavedPlans] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [isGeneratingFromChat, setIsGeneratingFromChat] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const redirectHandledRef = useRef(false);
  const [selectingIdeaId, setSelectingIdeaId] = useState<string | null>(null);

  const fetchChannelData = useCallback(async () => {
    if (!channelId) return;
    
    try {
      const response = await fetch(`/api/channel-info?channelId=${encodeURIComponent(channelId)}`);
      if (response.ok) {
        const data = await response.json();
        setChannelData({
          title: data.channel.title || 'DesignCourse',
          thumbnails: data.channel.thumbnails || {}
        });
        return;
      }
      if (response.status === 404) {
        console.log('Channel not found in database, using fallback');
      } else {
        console.error('API error:', response.status);
      }
      setChannelData({ title: 'DesignCourse', thumbnails: {} });
    } catch (err) {
      console.error('Error fetching channel data:', err);
      setChannelData({ title: 'DesignCourse', thumbnails: {} });
    }
  }, [channelId]);

  const fetchVideoIdeas = useCallback(async (forceRefresh = false, customPrompt?: string) => {
    if (!channelId) return;

    setIsLoading(true);
    setError(null);

    try {
      let response: Response;
      if (forceRefresh) {
        response = await fetch('/api/video-planner-ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, customPrompt }),
        });
      } else {
        response = await fetch(`/api/video-planner-ideas?channelId=${channelId}`);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch video ideas');
      }

      const data = await response.json();
      setVideoIdeas(data.ideas || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  const fetchSavedPlans = useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await fetch(`/api/video-plans?channelId=${encodeURIComponent(channelId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const plans = (data.plans || []) as { id: string; title: string; created_at: string }[];
      setSavedPlans(plans);
    } catch {}
  }, [channelId]);

  useEffect(() => {
    if (channelId) {
      fetchChannelData();
      const fromRedirect = searchParams.get('generating') === 'chat' && !redirectHandledRef.current;
      if (!fromRedirect) {
        fetchVideoIdeas();
      }
      fetchSavedPlans();
    }
  }, [channelId, fetchChannelData, fetchVideoIdeas, fetchSavedPlans, searchParams]);

  useEffect(() => {
    const generating = searchParams.get('generating');
    if (generating === 'chat' && !redirectHandledRef.current && channelId) {
      redirectHandledRef.current = true;
      setIsGeneratingFromChat(true);
      setFadeOut(true);

      setTimeout(async () => {
        window.dispatchEvent(new CustomEvent('refresh-neria-messages'));

        const backupTimeout = setTimeout(() => {
          setFadeOut(false);
          setIsGeneratingFromChat(false);
          fetchVideoIdeas();
        }, 30000);

        try {
          setFadeOut(true);
          const urlPrompt = new URL(window.location.href).searchParams.get('prompt') || undefined;
          await fetchVideoIdeas(true, urlPrompt);
          clearTimeout(backupTimeout);
          setTimeout(() => {
            setIsGeneratingFromChat(false);
            setFadeOut(false);
          }, 10);
        } catch (error) {
          clearTimeout(backupTimeout);
          setTimeout(() => {
            setIsGeneratingFromChat(false);
            setFadeOut(false);
          }, 10);
        }
      }, 600);

      const url = new URL(window.location.href);
      url.searchParams.delete('generating');
      window.history.replaceState({}, '', url.toString());
    }
  }, [channelId, fetchVideoIdeas, searchParams]);

  useEffect(() => {
    const handleVideoIdeasGenerating = (event: CustomEvent) => {
      console.log('🔄 Received video-ideas-generating event:', event.detail.message);
      setIsGeneratingFromChat(true);
      setFadeOut(true);
    };

    const handleVideoIdeasGenerated = (event: CustomEvent) => {
      console.log('✅ Received video-ideas-generated event:', event.detail.message);
      setTimeout(async () => {
        if (!channelId) return;
        setError(null);
        try {
          const response = await fetch(`/api/video-planner-ideas?channelId=${channelId}`);
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch video ideas');
          }
          const data = await response.json();
          setVideoIdeas(data.ideas || []);
          setFadeOut(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An error occurred');
          setFadeOut(false);
        } finally {
          setIsGeneratingFromChat(false);
        }
      }, 1000);
    };

    window.addEventListener('video-ideas-generating', handleVideoIdeasGenerating as EventListener);
    window.addEventListener('video-ideas-generated', handleVideoIdeasGenerated as EventListener);
    return () => {
      window.removeEventListener('video-ideas-generating', handleVideoIdeasGenerating as EventListener);
      window.removeEventListener('video-ideas-generated', handleVideoIdeasGenerated as EventListener);
    };
  }, [channelId]);

  const handleCardClick = async (ideaId: string) => {
    if (!channelId) return;
    try {
      setSelectingIdeaId(ideaId);
      // Show spinner state immediately
      setFadeOut(false);

      const res = await fetch('/api/video-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, ideaId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create video plan');
      }
      const { planId } = await res.json();
      // Navigate to the new page
      router.push(`/dashboard/${encodeURIComponent(channelId)}/planner/video/${encodeURIComponent(planId)}`);
    } catch (e) {
      setSelectingIdeaId(null);
      setError(e instanceof Error ? e.message : 'An error occurred');
    }
  };

  const getChannelAvatar = () => {
    if (!channelData?.thumbnails) return null;
    const thumbnails = channelData.thumbnails;
    if (thumbnails.high?.url) return thumbnails.high.url;
    if (thumbnails.medium?.url) return thumbnails.medium.url;
    if (thumbnails.default?.url) return thumbnails.default.url;
    if (thumbnails.maxres?.url) return thumbnails.maxres.url;
    if (thumbnails.standard?.url) return thumbnails.standard.url;
    return null;
  };

  // Reset avatar error state when the channel changes or the selected avatar URL changes
  useEffect(() => {
    setAvatarFailed(false);
  }, [channelData]);

  const lastGenerated = videoIdeas.length > 0
    ? videoIdeas.reduce((latest, idea) => {
        const t = new Date(idea.created_at).toISOString();
        return t > latest ? t : latest;
      }, new Date(videoIdeas[0].created_at).toISOString())
    : undefined;

  const handleRefresh = () => {
    setGenerating(true);
    setFadeOut(true);
    setTimeout(async () => {
      await fetchVideoIdeas(true);
      setFadeOut(false);
      setGenerating(false);
    }, 300);
  };

  return (
    <div className="space-y-15">
      {savedPlans.length > 0 && (
        <div className="relative">
          <div 
            className={`grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 transition-opacity duration-500 ${
              fadeOut ? 'opacity-30' : 'opacity-100'
            }`}
          >
            {savedPlans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => router.push(`/dashboard/${encodeURIComponent(channelId)}/planner/video/${encodeURIComponent(plan.id)}`)}
                className="transition-all duration-300 text-left planner-card-hover"
                style={{ minWidth: '300px' }}
              >
                <div className="bg-white rounded-lg overflow-hidden">
                  <div className="w-full h-[221px] flex items-center justify-center" style={{ backgroundColor: '#D7D9F2' }}>
                    <span className="text-gray-500">Thumbnail Preview</span>
                  </div>
                  <div className="p-4 flex items gap-4">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
                      {getChannelAvatar() && !avatarFailed ? (
                        <img 
                          src={getChannelAvatar()!}
                          alt={`${channelData?.title} avatar`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                          onError={() => setAvatarFailed(true)}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                          <span className="text-white font-medium text-sm">
                            {channelData?.title?.charAt(0) || '?'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-gray-900 mb-1 leading-tight min-h-[2.5rem] flex items-start">
                        <span className="line-clamp-2">{plan.title}</span>
                      </h3>
                      <p className="text-base text-gray-600">{channelData?.title || 'DesignCourse'}</p>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <RefreshContainer 
        lastUpdated={lastGenerated}
        onRefresh={handleRefresh}
        isLoading={isLoading || generating || isGeneratingFromChat}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      <div className="relative">
        {(() => {
          const shouldShowLoading = (generating || isGeneratingFromChat || (isLoading && videoIdeas.length === 0));
          return shouldShowLoading;
        })() && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        )}

        <div 
          className={`grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 transition-opacity duration-500 ${
            fadeOut ? 'opacity-30' : 'opacity-100'
          }`}
          style={{ 
            opacity: (generating || isGeneratingFromChat || (isLoading && videoIdeas.length === 0)) ? 0.3 : fadeOut ? 0.3 : 1,
            minHeight: videoIdeas.length === 0 ? '400px' : 'auto'
          }}
        >
          {videoIdeas.map((idea) => (
            <button
              key={idea.id}
              onClick={() => handleCardClick(idea.id)}
              className="transition-all duration-300 text-left planner-card-hover"
              style={{ minWidth: '300px' }}
              disabled={generating || isGeneratingFromChat}
            >
              <div className="bg-white rounded-lg overflow-hidden">
                <div className="w-full h-[221px] flex items-center justify-center relative" style={{ backgroundColor: '#D7D9F2' }}>
                  {(selectingIdeaId === idea.id) ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <span className="text-gray-500">Thumbnail Preview</span>
                  )}
                </div>

                <div className="p-4 flex items gap-4">
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
                    {getChannelAvatar() && !avatarFailed ? (
                      <img 
                        src={getChannelAvatar()!}
                        alt={`${channelData?.title} avatar`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        onError={() => setAvatarFailed(true)}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                        <span className="text-white font-medium text-sm">
                          {channelData?.title?.charAt(0) || '?'}
                        </span>
                      </div>
                    )}
                  </div>
                  
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
              </div>
            </button>
          ))}
        </div>
      </div>

      {!isLoading && videoIdeas.length === 0 && !error && !(generating || isGeneratingFromChat) && (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">No video ideas generated yet.</p>
          <button
            onClick={handleRefresh}
            disabled={generating || isGeneratingFromChat}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${(generating || isGeneratingFromChat) ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none">
              <path 
                d="M12 2V6M12 18V22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round"
              />
            </svg>
            {(generating || isGeneratingFromChat) ? 'Generating...' : 'Generate Ideas'}
          </button>
        </div>
      )}
    </div>
  );
}


