'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NeriaResponse from '@/components/NeriaResponse';

type PreviewPayload = {
  channel: { id: string; title: string; description: string; subs: number; views: number; videoCount: number; publishedAt: string };
  analytics90d: { baseline: { ctrMedian: number; avgPctMedian: number } };
  winners: Array<{ id: string; title: string; thumb: string; publishedAt: string; duration: string; metrics: { views: number; watchTime: number; avgViewDur: number; avgViewPct: number; impressions: number; ctr: number; subsGained: number; viewsPerDay: number } }>;
  loserIds: string[];
  primaryLoserId?: string;
  slide1Text?: string;
  slide2Text?: string;
  slide3Text?: string;
};

const SLIDE_COUNT = 5;
const DEFAULT_SLIDE_DURATION_MS = 9000;
const SLIDE1_BUFFER_MS = 5000;

// Figma-exported icons
const YT_ICON = '/figma-assets/757f0495cbc551f37fe33eac1b0cce0e949d7111.svg';
const SUBS_ICON = '/figma-assets/50e5d9a8e1aff66e00607d93276f2478d619315f.svg';
const VIEWS_ICON = '/figma-assets/8fb688d907d03ee8e0e2a2b4f499bae5a1a16025.svg';
const VIDEOS_ICON = '/figma-assets/cb53ce837b890bd2298e85b12bc94eb30cffac14.svg';

export default function CollectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelId = searchParams.get('channelId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [userInteractedAt, setUserInteractedAt] = useState<number>(0);
  const [pauseTimer, setPauseTimer] = useState(false);
  const [slide1Done, setSlide1Done] = useState(false);
  const [slide2Done, setSlide2Done] = useState(false);
  const [slide3Done, setSlide3Done] = useState(false);
  const [metaAnim, setMetaAnim] = useState(false);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const prefersReduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  // Utilities
  const firstSentence = (text: string) => {
    if (!text) return '';
    const parts = text
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s+/);
    return (parts[0] || text).trim();
  };

  const formatCompactCount = (value: number) => {
    const n = Number(value || 0);
    if (n < 1000) {
      return new Intl.NumberFormat().format(n);
    }
    if (n < 100000) {
      const v = n / 1000;
      const s = v.toFixed(1);
      return `${s.endsWith('.0') ? s.slice(0, -2) : s}k`;
    }
    if (n < 1000000) {
      const v = Math.floor(n / 1000);
      return `${v}k`;
    }
    const m = n / 1000000;
    const ms = m.toFixed(1);
    return `${ms.endsWith('.0') ? ms.slice(0, -2) : ms}M`;
  };

  // Helpers for Slide 2
  const parseISODurationToHMS = (iso: string) => {
    if (!iso) return '';
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    return `${minutes}:${pad(seconds)}`;
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const buildSlide2Insight = (payload: PreviewPayload) => {
    const winners = Array.isArray(payload.winners) ? payload.winners : [];
    if (winners.length === 0) {
      return `Not enough recent data to surface top performers yet. I'll watch new uploads and highlight wins next.`;
    }
    const topByViews = winners.reduce((best, cur) => (cur.metrics.views > best.metrics.views ? cur : best), winners[0]);
    const views = formatCompactCount(topByViews.metrics.views);
    const vpd = Math.round(topByViews.metrics.viewsPerDay);
    const avgPct = Math.round(topByViews.metrics.avgViewPct);
    const avgDurSec = Math.round(topByViews.metrics.avgViewDur);
    const avgMin = Math.floor(avgDurSec / 60);
    const avgSec = Math.round(avgDurSec % 60);
    const avgDurStr = `${avgMin}m ${avgSec}s`;
    return `Your strongest performer in the last 90 days is “${topByViews.title}” — ${views} views (~${vpd}/day), average view duration ${avgDurStr}, and average view percentage ${avgPct}%. Let’s double down on what made this work while we review patterns across the rest of your winners.`;
  };

  useEffect(() => {
    if (!channelId) {
      router.push('/dashboard');
      return;
    }
    const fetchPreview = async () => {
      try {
        setLoading(true);
        
        // Try workflow API first
        let res = await fetch(`/api/collection/preview-workflow?channelId=${encodeURIComponent(channelId)}&refresh=1`, { cache: 'no-store' });
        
        // Fallback to original API if workflow fails
        if (!res.ok) {
          console.warn('Workflow API failed, falling back to original API');
          res = await fetch(`/api/collection/preview?channelId=${encodeURIComponent(channelId)}&refresh=1`, { cache: 'no-store' });
        }
        
        if (!res.ok) throw new Error(await res.text());
        const json: PreviewPayload = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    fetchPreview();
  }, [channelId, router]);

  // Pause timer utility (reserved for future lazy slides)
  const setLoadingPause = (isPaused: boolean) => {
    setPauseTimer(isPaused);
  };

  // Reset slide completion state when returning to it
  useEffect(() => {
    if (activeSlide === 0) {
      setSlide1Done(false);
      if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
    } else if (activeSlide === 1) {
      setSlide2Done(false);
      if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
    } else if (activeSlide === 2) {
      setSlide3Done(false);
      if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
    }
  }, [activeSlide]);

  // Timer bar animation and auto-advance (dynamic for slide 1)
  useEffect(() => {
    if (!data || prefersReduced) return; // disable auto-advance when reduced motion
    if (pauseTimer) return;

    let raf: number | null = null;
    let start = 0;
    let duration = 0;
    const lastInteractionWithin3s = () => Date.now() - userInteractedAt < 3000;

    const animate = (t: number) => {
      if (start === 0) start = t;
      const elapsed = t - start;
      const ratio = Math.min(1, duration > 0 ? elapsed / duration : 0);
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${ratio})`;
        progressRef.current.style.transformOrigin = 'left';
      }
      if (ratio >= 1) {
        if (!lastInteractionWithin3s()) {
          setActiveSlide((s) => (s + 1) % SLIDE_COUNT);
        }
        return; // stop animating; effect will rerun on activeSlide change
      }
      raf = requestAnimationFrame(animate);
    };

    // Slide-specific timing
    if (activeSlide === 0) {
      // Wait for Neria to finish; then 5s buffer with progress
      if (!slide1Done) {
        if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
        return; // do not start timer yet
      }
      start = performance.now();
      duration = SLIDE1_BUFFER_MS;
      raf = requestAnimationFrame(animate);
      return () => { if (raf) cancelAnimationFrame(raf); };
    } else if (activeSlide === 1) {
      if (!slide2Done) {
        if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
        return;
      }
      start = performance.now();
      duration = DEFAULT_SLIDE_DURATION_MS;
      raf = requestAnimationFrame(animate);
      return () => { if (raf) cancelAnimationFrame(raf); };
    } else if (activeSlide === 2) {
      if (!slide3Done) {
        if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
        return;
      }
      start = performance.now();
      duration = DEFAULT_SLIDE_DURATION_MS;
      raf = requestAnimationFrame(animate);
      return () => { if (raf) cancelAnimationFrame(raf); };
    } else {
      start = performance.now();
      duration = DEFAULT_SLIDE_DURATION_MS;
      raf = requestAnimationFrame(animate);
      return () => { if (raf) cancelAnimationFrame(raf); };
    }
  }, [data, activeSlide, userInteractedAt, pauseTimer, prefersReduced, slide1Done, slide2Done, slide3Done]);

  const onDotClick = (index: number) => {
    setUserInteractedAt(Date.now());
    setActiveSlide(index);
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
  };

  // Lazy load for Slide 3 losers
  const [losersLoading, setLosersLoading] = useState(false);
  const [loserCard, setLoserCard] = useState<{ id: string; title: string; thumb: string; publishedAt: string; duration: string } | null>(null);

  useEffect(() => {
    const go = async () => {
      if (activeSlide !== 2 || !data || loserCard || losersLoading) return;
      setLosersLoading(true);
      setLoadingPause(true);
      try {
        const res = await fetch('/api/collection/losers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: data.primaryLoserId ? [data.primaryLoserId] : data.loserIds.slice(0,1), channelId }),
        });
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json?.items) ? json.items : [];
          setLoserCard(items[0] || null);
        }
      } catch {}
      finally {
        setLosersLoading(false);
        setLoadingPause(false);
      }
    };
    go();
  }, [activeSlide, data, channelId, loserCard, losersLoading]);

  const visible = !loading && !!data;

  // Trigger metadata entrance animation when content becomes visible
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setMetaAnim(true), 50);
      return () => clearTimeout(t);
    } else {
      setMetaAnim(false);
    }
  }, [visible]);

  return (
    <div className="w-full min-h-screen">
      {!visible && (
        <div className="w-full min-h-screen flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}

      {visible && data && (
        <div className="content-stretch flex flex-col justify-between relative w-full min-h-screen px-[4%] py-[3%] pb-[70px] max-w-[1600px] mx-auto" data-name="Collection Layout">
          {/* Top: Pagination + Content */}
          <div className="content-stretch flex flex-col gap-12 items-start justify-start relative w-full">
            <div className="flex gap-3 items-center" aria-label="pagination">
              {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => onDotClick(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`w-3 h-3 rounded-full border-2 border-black ${i === activeSlide ? 'bg-black' : 'bg-transparent'}`}
                />
              ))}
            </div>

            {/* Slide content area: layout switches by slide */}
            {activeSlide === 0 && (
              <div className="content-stretch flex items-center justify-center w-full">
                <div className="w-full">
                  <NeriaResponse
                    response={data.slide1Text || `I was able to gather some valuable insights into your channel, ${data.channel.title}. I’m confident we can work together to help your channel grow.`}
                    isVisible={true}
                    onComplete={() => setSlide1Done(true)}
                  />
                </div>
              </div>
            )}

            {activeSlide === 1 && (
              <div className="content-stretch w-full flex flex-row gap-12 items-stretch">
                {/* Left: YouTube video hero card for top winner by views */}
                <div className="flex-1 min-w-[250px] max-w-[250px]">
                  {data.winners && data.winners.length > 0 ? (
                    (() => {
                      const top = data.winners.reduce((best, cur) => (cur.metrics.views > best.metrics.views ? cur : best), data.winners[0]);
                      return (
                        <div className="w-full border border-black rounded-[12px] overflow-hidden bg-white shadow-[4px_4px_0_0_#000]">
                          <div className="aspect-video w-full bg-[#f4f4f4] overflow-hidden">
                            {top.thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={top.thumb} alt={top.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-black">No thumbnail</div>
                            )}
                          </div>
                          <div className="p-5 flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold px-2 py-1 border border-black rounded-full">Top performer</span>
                              <span className="text-xs text-black/70">{formatDate(top.publishedAt)} • {parseISODurationToHMS(top.duration)}</span>
                            </div>
                            <div className="text-[20px] leading-snug font-semibold text-black">{top.title}</div>
                            <div className="flex gap-6 text-sm text-black/80">
                              <div><span className="font-semibold">Views:</span> {formatCompactCount(top.metrics.views)}</div>
                              <div><span className="font-semibold">Avg %:</span> {Math.round(top.metrics.avgViewPct)}%</div>
                              <div><span className="font-semibold">VPD:</span> {Math.round(top.metrics.viewsPerDay)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="w-full h-full min-h-[240px] border border-dashed border-black rounded-[12px] flex items-center justify-center text-black">No recent winners</div>
                  )}
                </div>

                {/* Right: Neria insight with same animation/styling */}
                <div className="flex-1 min-w-[320px]">
                  <NeriaResponse
                    response={data.slide2Text && data.slide2Text.length > 0 ? data.slide2Text : buildSlide2Insight(data)}
                    isVisible={true}
                    onComplete={() => setSlide2Done(true)}
                  />
                </div>
              </div>
            )}

            {activeSlide === 2 && (
              <div className="content-stretch w-full flex flex-row gap-12 items-stretch">
                {/* Left: Single worst-performer card (mirrors Slide 2) */}
                <div className="flex-1 min-w-[250px] max-w-[250px]">
                  {losersLoading ? (
                    <div className="w-full min-h-[220px] flex items-center justify-center">
                      <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
                    </div>
                  ) : loserCard ? (
                    <div className="w-full border border-black rounded-[12px] overflow-hidden bg-white shadow-[4px_4px_0_0_#000]">
                      <div className="aspect-video w-full bg-[#f4f4f4] overflow-hidden">
                        {loserCard.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={loserCard.thumb} alt={loserCard.title} className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                      <div className="p-5 flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-1 border border-black rounded-full">Under-performer</span>
                          <span className="text-xs text-black/70">{formatDate(loserCard.publishedAt)} • {parseISODurationToHMS(loserCard.duration)}</span>
                        </div>
                        <div className="text-[20px] leading-snug font-semibold text-black line-clamp-2">{loserCard.title}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full min-h-[240px] border border-dashed border-black rounded-[12px] flex items-center justify-center text-black">No under-performer</div>
                  )}
                </div>

                {/* Right: Neria diagnosis */}
                <div className="flex-1 min-w-[320px]">
                  <NeriaResponse
                    response={losersLoading ? 'Analyzing the weakest theme from the last 90 days…' : (data.slide3Text && data.slide3Text.length > 0 ? data.slide3Text : 'This type of content is dragging down performance relative to your baseline. We should avoid or radically reframe this theme going forward.')}
                    isVisible={true}
                    onComplete={() => setSlide3Done(true)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Bottom: channel stats with internal progress bar */}
          <div className="w-full flex flex-col gap-4 mb-5">
            {/* Moved timer/progress bar inside the metadata section */}
            <div className="mb-4 h-[2px] bg-black origin-left slide-timer-bar" style={{ transform: 'scaleX(0)', transition: prefersReduced ? 'none' : 'transform 0.1s linear' }} ref={progressRef} />
            <div className="overflow-y-hidden">
            <div className="content-stretch flex items-start justify-between w-full">
              <div className="flex flex-col gap-6 items-start">
              <div className="flex flex-col gap-3 items-start">
                <div className={`flex items-center gap-3 transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                  <img src={YT_ICON} alt="YouTube" className="w-8 h-6" />
                  <div className="font-bold text-[38px] text-black">{data.channel.title?.toUpperCase?.() || data.channel.title}</div>
                </div>
              </div>
              <div className={`w-5/6 text-[19px] text-black max-w-[900px] mb-[70px] transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '100ms' }}>{firstSentence(data.channel.description)}</div>
              </div>
              <div className="flex gap-[67px] items-start">
                <div className="flex flex-col gap-4 items-start">
                <div className={`flex flex-col gap-3 items-start w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '150ms' }}>
                  <img src={SUBS_ICON} alt="Subscribers" className="h-[28px] w-[26px] object-contain" />
                  <div className="font-bold text-[19px] text-black">SUBSCRIBERS</div>
                </div>
                <div className={`font-semibold text-[50px] text-black w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '260ms' }}>{formatCompactCount(data.channel.subs)}</div>
                </div>
                <div className="flex flex-col gap-4 items-start">
                <div className={`flex flex-col gap-3 items-start w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '180ms' }}>
                  <img src={VIEWS_ICON} alt="Views" className="h-[26px] w-[26px] object-contain" />
                  <div className="font-bold text-[19px] text-black">VIEWS</div>
                </div>
                <div className={`font-semibold text-[50px] text-black w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '290ms' }}>{formatCompactCount(data.channel.views)}</div>
                </div>
                <div className="flex flex-col gap-4 items-start">
                <div className={`flex flex-col gap-3 items-start w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '210ms' }}>
                  <img src={VIDEOS_ICON} alt="Videos" className="h-[26px] w-[26px] object-contain" />
                  <div className="font-bold text-[19px] text-black">VIDEOS</div>
                </div>
                <div className={`font-semibold text-[50px] text-black w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '320ms' }}>{formatCompactCount(data.channel.videoCount)}</div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


