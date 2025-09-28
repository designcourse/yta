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
  const [savedPlans, setSavedPlans] = useState<{ id: string; title: string; created_at: string; thumbnail_url?: string | null; thumbnail_selected_at?: string | null; is_next?: boolean }[]>([]);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [isGeneratingFromChat, setIsGeneratingFromChat] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const redirectHandledRef = useRef(false);
  const [selectingIdeaId, setSelectingIdeaId] = useState<string | null>(null);
  const [uploadingPlanId, setUploadingPlanId] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({});
  const [prepublishStatus, setPrepublishStatus] = useState<Record<string, { id?: string; status?: string; summary?: string }>>({});

  async function uploadWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.max(0, Math.min(100, (evt.loaded / evt.total) * 100));
          onProgress(pct);
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.send(file);
    });
  }

  function pollPrepublish(preId: string, planId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/videos/prepublish/${encodeURIComponent(preId)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const status = data?.video?.status || 'queued';
        const errorMsg = data?.video?.error || undefined;
        setPrepublishStatus((s) => ({ ...s, [planId]: { id: preId, status, summary: errorMsg } }));
        if (status === 'ready' || status === 'error' || status === 'expired') clearInterval(interval);
      } catch {}
    }, 4000);
  }

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
      const plans = (data.plans || []) as { id: string; title: string; created_at: string; thumbnail_url?: string | null; thumbnail_selected_at?: string | null; is_next?: boolean }[];
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

  // Initialize prepublish status for existing videos
  useEffect(() => {
    if (savedPlans.length > 0) {
      savedPlans.forEach(async (plan) => {
        if (!prepublishStatus[plan.id]) {
          try {
            const res = await fetch(`/api/videos/prepublish?planId=${plan.id}`);
            if (res.ok) {
              const data = await res.json();
              if (data.video) {
                setPrepublishStatus((s) => ({ 
                  ...s, 
                  [plan.id]: { 
                    id: data.video.id, 
                    status: data.video.status,
                    summary: data.video.error
                  } 
                }));
                // Start polling if still processing
                if (data.video.status === 'queued' || data.video.status === 'analyzing') {
                  pollPrepublish(data.video.id, plan.id);
                }
              }
            }
          } catch (err) {
            console.error('Failed to fetch prepublish status for plan', plan.id, err);
          }
        }
      });
    }
  }, [savedPlans]);

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
              <div
                key={plan.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/dashboard/${encodeURIComponent(channelId)}/planner/video/${encodeURIComponent(plan.id)}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/dashboard/${encodeURIComponent(channelId)}/planner/video/${encodeURIComponent(plan.id)}`); } }}
                className="transition-all duration-300 text-left planner-card-hover focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-lg"
                style={{ minWidth: '300px' }}
              >
                <div className="bg-white rounded-lg overflow-hidden">
                  <div className="w-full h-[221px] flex items-center justify-center relative" style={{ backgroundColor: '#D7D9F2' }}>
                    {plan.is_next && (
                      <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/80 text-white text-[10px] font-bold tracking-wide">
                        NEXT VIDEO
                      </div>
                    )}
                    {plan.thumbnail_url ? (
                      // If a custom thumbnail was selected for this plan, show it
                      (() => {
                        try {
                          const u = new URL(plan.thumbnail_url as string);
                          const key = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
                          const Presigned = require('./PresignedImage').default as (props: any) => JSX.Element;
                          return (
                            <Presigned 
                              fileKey={key} 
                              fallbackUrl={plan.thumbnail_url || undefined}
                              className="absolute inset-0"
                              imgClassName="w-full h-full object-cover"
                            />
                          );
                        } catch {
                          return (
                            <img
                              src={plan.thumbnail_url as string}
                              alt={`${plan.title} thumbnail`}
                              className="absolute inset-0 w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          );
                        }
                      })()
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
                        <span className="line-clamp-2">{plan.title}</span>
                      </h3>
                      <p className="text-base text-gray-600">{channelData?.title || 'DesignCourse'}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <label
                          className="inline-block px-3 py-1 text-sm border rounded cursor-pointer bg-gray-50 hover:bg-gray-100"
                          onClick={(e) => { e.stopPropagation(); }}
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onPointerDown={(e) => { e.stopPropagation(); }}
                        >
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingPlanId(plan.id);
                              try {
                                // 1) get presigned PUT for raw upload
                                const initRes = await fetch('/api/videos/prepublish/init', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ channelId, planId: plan.id, fileName: file.name, contentType: file.type })
                                });
                                const initJson = await initRes.json();
                                if (!initRes.ok) throw new Error(initJson?.error || 'init failed');
                                // 2) upload file with progress
                                setUploadPct((p) => ({ ...p, [plan.id]: 0 }));
                                await uploadWithProgress(initJson.uploadUrl, file, file.type, (pct) => {
                                  setUploadPct((p) => ({ ...p, [plan.id]: Math.round(pct) }));
                                });
                                // 3) commit + trigger analysis
                                const commitRes = await fetch('/api/videos/prepublish/commit', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ channelId, planId: plan.id, key: initJson.key, mime: file.type, sizeBytes: file.size })
                                });
                                const commitJson = await commitRes.json();
                                if (!commitRes.ok) throw new Error(commitJson?.error || 'commit failed');
                                setPrepublishStatus((s) => ({ ...s, [plan.id]: { id: commitJson.id, status: 'queued' } }));
                                pollPrepublish(commitJson.id, plan.id);
                              } catch (err: any) {
                                setPrepublishStatus((s) => ({ ...s, [plan.id]: { status: 'error', summary: String(err?.message || err) } }));
                              } finally {
                                setUploadingPlanId(null);
                              }
                            }}
                          />
                          {uploadingPlanId === plan.id
                            ? `Uploading… ${uploadPct[plan.id] ?? 0}%`
                            : 'Analyze rough cut'}
                        </label>
                        {prepublishStatus[plan.id]?.status && (
                          <span className="text-xs text-gray-500">
                            {prepublishStatus[plan.id]?.status}
                            {prepublishStatus[plan.id]?.summary && prepublishStatus[plan.id]?.status === 'error' && (
                              <span className="text-red-600 ml-1">({prepublishStatus[plan.id]?.summary})</span>
                            )}
                          </span>
                        )}
                        <button
                          className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Reanalyze latest prior upload for this plan (no re-upload needed)
                            setPrepublishStatus((s) => ({ ...s, [plan.id]: { status: 'analyzing', summary: 'Starting re-analysis...' } }));
                            const res = await fetch('/api/videos/prepublish/reanalyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.id }) });
                            const j = await res.json().catch(() => ({}));
                            if (res.ok && j?.prepublishVideoId) {
                              setPrepublishStatus((s)=>({ ...s, [plan.id]: { id: j.prepublishVideoId, status: 'analyzing' } }));
                              pollPrepublish(j.prepublishVideoId, plan.id);
                            } else {
                              const errorMsg = j?.error || (res.ok ? 'No prior upload found' : `Failed: ${res.status}`);
                              setPrepublishStatus((s)=>({ ...s, [plan.id]: { status: 'error', summary: errorMsg } }));
                            }
                          }}
                        >Reanalyze</button>
                        {uploadPct[plan.id] != null && uploadingPlanId === plan.id && (
                          <div className="flex-1 h-1 bg-gray-200 rounded overflow-hidden">
                            <div className="h-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, uploadPct[plan.id]))}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 3-dot menu to mark as next */}
                    <PlanMenu planId={plan.id} title={plan.title} channelId={channelId} isNext={!!plan.is_next} onMarked={fetchSavedPlans} />
                  </div>
                </div>
              </div>
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

function PlanMenu({ planId, title, channelId, isNext, onMarked }: { planId: string; title: string; channelId: string; isNext: boolean; onMarked: () => void }) {
  const [open, setOpen] = useState(false);
  
  useEffect(() => {
    const handleClickOutside = () => setOpen(false);
    if (open) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [open]);
  
  return (
    <div className="relative">
      <button
        type="button"
        className="p-1 rounded hover:bg-gray-100"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="12" r="2" fill="currentColor"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
          <circle cx="19" cy="12" r="2" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded shadow-md z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {!isNext && (
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={async () => {
                try {
                  await fetch('/api/video-plans', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: planId, mark_next: true }),
                  });
                  // Proactively let Neria react immediately to the new next video
                  try {
                    console.log('[PlannerClient] Dispatching next video event:', { title, channelId });
                    window.dispatchEvent(new CustomEvent('neria-next-video-updated', { detail: { title, channelId } }));
                    try {
                      localStorage.setItem('neriaNextVideo', JSON.stringify({ channelId, title }));
                    } catch {}
                  } catch (err) {
                    console.error('[PlannerClient] Error dispatching event:', err);
                  }
                  setOpen(false);
                  onMarked();
                } catch {}
              }}
            >
              Mark as next video
            </button>
          )}
          {isNext && (
            <div className="px-3 py-2 text-xs text-green-700">This is marked as next</div>
          )}
        </div>
      )}
    </div>
  );
}


