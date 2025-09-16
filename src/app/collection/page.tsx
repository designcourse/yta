'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NeriaResponse from '@/components/NeriaResponse';
import dynamic from 'next/dynamic';

const BillingModal = dynamic(() => import('@/components/BillingModal'), { ssr: false });

type Slide = { id: 1 | 2 | 3; headline: string; body: string; keyStats: Array<{ label: string; value: string; note?: string }>; actions: string[]; confidence: number };

type Insight = {
  type: string;
  title: string;
  description: string;
  impact: number;
  actionability: number;
  priority: number;
  evidence: string[];
  actions: string[];
  confidence: number;
  dataSources?: string[];
  rawData?: any;
};

type PreviewPayload = {
  channelMeta: { id: string; title: string; subs: number; views: number; videoCount: number; publishedAt: string };
  winners: Array<{ videoId: string; title: string; thumb: string; publishedAt?: string; duration?: string; viewsPerDay90?: number }>;
  losers: Array<{ videoId: string; title: string; thumb: string; publishedAt?: string; duration?: string; viewsPerDay90?: number }>;
  slides: Slide[];
  insights?: {
    topInsights: Insight[];
    channelHealth: {
      overall: number;
      retention: number;
      consistency: number;
      growth: number;
    };
    growthPotential?: {
      overall: number;
      retention: number;
      consistency: number;
      growth: number;
    };
  };
};

// SLIDE_COUNT will be dynamic based on data
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
  const testingMode = searchParams.get('testing') === 'true';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [userInteractedAt, setUserInteractedAt] = useState<number>(0);
  const [pauseTimer, setPauseTimer] = useState(false);
  const [slide1Done, setSlide1Done] = useState(false);
  const [slide2Done, setSlide2Done] = useState(false);
  const [slide3Done, setSlide3Done] = useState(false);
  const [slide4Done, setSlide4Done] = useState(false);
  const [slide5Done, setSlide5Done] = useState(false);
  const [metaAnim, setMetaAnim] = useState(false);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const prefersReduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  // Billing gating
  const [showBilling, setShowBilling] = useState(false);
  const [hasActiveSub, setHasActiveSub] = useState<boolean | null>(null);
  
  // Calculate dynamic slide count
  const visible = !loading && !!data;
  const slideCount = testingMode ? (data?.slides?.length || 0) : 6;

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


  const buildSlideText = (s?: Slide) => {
    if (!s) return '';
    return s.body.trim();
  };

  useEffect(() => {
    if (!channelId) {
      router.push('/dashboard');
      return;
    }
    const fetchPreview = async () => {
      try {
        setLoading(true);
        const testingParam = testingMode ? '&testing=true' : '';
        const res = await fetch(`/api/collection/preview?channelId=${encodeURIComponent(channelId)}&refresh=1${testingParam}`, { cache: 'no-store' });
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

  // Check subscription status when approaching slide 6 (billing)
  useEffect(() => {
    const go = async () => {
      if (!channelId) return;
      if (activeSlide !== 5) return;
      try {
        const res = await fetch(`/api/billing/status?channelId=${encodeURIComponent(channelId)}`);
        const json = await res.json();
        if (json?.hasActive) {
          router.push(`/dashboard?channelId=${encodeURIComponent(channelId)}`);
        } else {
          setHasActiveSub(false);
          setShowBilling(true);
          setPauseTimer(true);
        }
      } catch {}
    };
    go();
  }, [activeSlide, channelId, router]);

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
    } else if (activeSlide === 3) {
      setSlide4Done(false);
      if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
    } else if (activeSlide === 4) {
      setSlide5Done(false);
      if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
    }
  }, [activeSlide]);

  // Timer bar animation and auto-advance (dynamic for slide 1)
  useEffect(() => {
    if (!data || prefersReduced || testingMode) return; // disable auto-advance when reduced motion or in testing mode
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
          setActiveSlide((s) => (s + 1) % slideCount);
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
    } else if (activeSlide === 3) {
      if (!slide4Done) {
        if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
        return;
      }
      start = performance.now();
      duration = DEFAULT_SLIDE_DURATION_MS;
      raf = requestAnimationFrame(animate);
      return () => { if (raf) cancelAnimationFrame(raf); };
    } else if (activeSlide === 4) {
      // Slide 5: What You'll Unlock - no auto-advance, let user read
      return;
    } else if (activeSlide === 5) {
      // slide 6: billing gate, timer stops if modal shown
      if (showBilling) return;
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
  }, [data, activeSlide, userInteractedAt, pauseTimer, prefersReduced, testingMode, slide1Done, slide2Done, slide3Done, slide4Done, slide5Done, showBilling, slideCount]);

  const onDotClick = (index: number) => {
    setUserInteractedAt(Date.now());
    setActiveSlide(index);
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
  };

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
              {testingMode && (
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-1 rounded text-sm font-medium mr-4">
                  TESTING MODE: {slideCount} insights
                </div>
              )}
              {Array.from({ length: slideCount }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => onDotClick(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`w-3 h-3 rounded-full border-2 border-black ${i === activeSlide ? 'bg-black' : 'bg-transparent'}`}
                />
              ))}
            </div>

            {/* Dynamic slide content */}
            {testingMode ? (
              // Testing mode: show all insights as individual slides
              <div className="content-stretch flex flex-col items-start justify-start w-full overflow-y-auto max-h-[70vh] pr-2" style={{scrollbarWidth: 'thin'}}>
                {data.slides?.[activeSlide] && (
                  <div className="w-full pb-8">
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-black mb-2">{data.slides[activeSlide].headline}</h2>
                      <div className="text-lg text-black/80 mb-4">{data.slides[activeSlide].body}</div>
                    </div>
                    
                    {/* Key Stats */}
                    {data.slides[activeSlide].keyStats && data.slides[activeSlide].keyStats.length > 0 && (
                      <div className="mb-6">
                        <h3 className="font-semibold text-lg mb-3">Key Metrics:</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {data.slides[activeSlide].keyStats.map((stat, i) => (
                            <div key={i} className="border border-gray-300 rounded p-3 bg-gray-50">
                              <div className="font-medium text-sm text-black/70">{stat.label}</div>
                              <div className="font-bold text-lg">{stat.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Actions */}
                    {data.slides[activeSlide].actions && data.slides[activeSlide].actions.length > 0 && (
                      <div className="mb-6">
                        <h3 className="font-semibold text-lg mb-3">Recommended Actions:</h3>
                        <ul className="list-disc list-inside space-y-2">
                          {data.slides[activeSlide].actions.map((action, i) => (
                            <li key={i} className="text-black/80">{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Data Sources - Testing Mode Only */}
                    {data.insights?.topInsights[activeSlide]?.dataSources && (
                      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
                        <h3 className="font-semibold text-lg mb-3 text-blue-800">📊 YouTube Analytics Data Sources:</h3>
                        <ul className="list-disc list-inside space-y-1">
                          {data.insights.topInsights[activeSlide].dataSources.map((source: string, i: number) => (
                            <li key={i} className="text-blue-700 text-sm font-mono">{source}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Raw Data - Testing Mode Only */}
                    {data.insights?.topInsights[activeSlide]?.rawData && (
                      <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
                        <h3 className="font-semibold text-lg mb-3 text-green-800">🔢 Actual YouTube Data Used:</h3>
                        <div className="bg-white p-4 rounded border overflow-x-auto">
                          <pre className="text-xs text-green-900 whitespace-pre-wrap font-mono">
                            {JSON.stringify(data.insights.topInsights[activeSlide].rawData, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              // Normal mode: original slide content
              <>
                {activeSlide === 0 && (
                  <div className="content-stretch flex items-center justify-center w-full">
                    <div className="w-full">
                      <NeriaResponse
                        response={buildSlideText(data.slides?.[0]) || `Welcome to your channel snapshot, ${data.channelMeta.title}.`}
                        isVisible={true}
                        onComplete={() => setSlide1Done(true)}
                      />
                    </div>
                  </div>
                )}

                {activeSlide === 1 && (
                  <div className="content-stretch flex items-center justify-center w-full">
                    <div className="w-full">
                      <NeriaResponse
                        response={buildSlideText(data.slides?.[1])}
                        isVisible={true}
                        onComplete={() => setSlide2Done(true)}
                      />
                    </div>
                  </div>
                )}

                {activeSlide === 2 && (
                  <div className="content-stretch flex items-center justify-center w-full">
                    <div className="w-full">
                      <NeriaResponse
                        response={buildSlideText(data.slides?.[2])}
                        isVisible={true}
                        onComplete={() => setSlide3Done(true)}
                      />
                    </div>
                  </div>
                )}

                {activeSlide === 3 && (
                  <div className="content-stretch flex items-center justify-center w-full">
                    <div className="w-full">
                      <NeriaResponse
                        response={data.insights && data.insights.growthPotential 
                          ? `Your channel is currently operating at only ${100 - data.insights.growthPotential.overall}% of its potential. That means you're leaving ${data.insights.growthPotential.overall}% of possible views, subscribers, and revenue on the table. The biggest opportunity is ${data.insights.topInsights[0]?.title.toLowerCase() || 'content optimization'}, which alone could recover ${data.insights.topInsights[0]?.evidence?.[0] || 'significant growth'}.`
                          : `I've identified critical growth blockers in your channel. Based on channels similar to yours, you should be getting 3-5x more views. Let me show you exactly what's holding you back and how to fix it.`}
                        isVisible={true}
                        onComplete={() => setSlide4Done(true)}
                      />
                    </div>
                  </div>
                )}

                {activeSlide === 4 && (
                  <div className="content-stretch w-full">
                    <div className="w-full max-w-4xl mx-auto">
                      <h2 className="text-3xl font-bold text-black mb-8">Here's What You'll Unlock Immediately:</h2>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="border border-black rounded-lg p-6 bg-white shadow-[4px_4px_0_0_#000]">
                          <div className="text-2xl mb-2">🎯</div>
                          <h3 className="font-bold text-lg mb-2">Your 7 Viral Short Moments</h3>
                          <p className="text-sm text-black/80">Exact timestamps from your videos that match viral patterns. Copy what's working for channels getting 10M+ Short views.</p>
                        </div>
                        
                        <div className="border border-black rounded-lg p-6 bg-white shadow-[4px_4px_0_0_#000]">
                          <div className="text-2xl mb-2">📊</div>
                          <h3 className="font-bold text-lg mb-2">Algorithm Recovery Plan</h3>
                          <p className="text-sm text-black/80">3 proven strategies from channels that recovered from the November algorithm change. Most see results in 3-4 weeks.</p>
                        </div>
                        
                        <div className="border border-black rounded-lg p-6 bg-white shadow-[4px_4px_0_0_#000]">
                          <div className="text-2xl mb-2">🔍</div>
                          <h3 className="font-bold text-lg mb-2">Competitor Blind Spots</h3>
                          <p className="text-sm text-black/80">5 topics your competitors missed that their audience is asking for. First-mover advantage on untapped content.</p>
                        </div>
                        
                        <div className="border border-black rounded-lg p-6 bg-white shadow-[4px_4px_0_0_#000]">
                          <div className="text-2xl mb-2">💡</div>
                          <h3 className="font-bold text-lg mb-2">AI Script Generator</h3>
                          <p className="text-sm text-black/80">Generate complete video scripts based on your top performers. Includes hooks, retention tactics, and CTAs that convert.</p>
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <p className="text-lg text-black/60 mb-4">Join 1,247 creators already growing faster with Neria</p>
                        <p className="text-sm text-red-600 font-semibold animate-pulse">⚠️ This analysis expires in 24 hours</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeSlide === 5 && (
                  <div className="w-full flex items-center justify-center text-black">
                    <div className="text-xl">Ready to unlock your channel's full potential?</div>
                  </div>
                )}
              </>
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
                  <div className="font-bold text-[38px] text-black">{data.channelMeta.title?.toUpperCase?.() || data.channelMeta.title}</div>
                </div>
              </div>
              <div className={`w-5/6 text-[19px] text-black max-w-[900px] mb-[70px] transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '100ms' }}>{''}</div>
              </div>
              <div className="flex gap-[67px] items-start">
                <div className="flex flex-col gap-4 items-start">
                <div className={`flex flex-col gap-3 items-start w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '150ms' }}>
                  <img src={SUBS_ICON} alt="Subscribers" className="h-[28px] w-[26px] object-contain" />
                  <div className="font-bold text-[19px] text-black">SUBSCRIBERS</div>
                </div>
                <div className={`font-semibold text-[50px] text-black w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '260ms' }}>{formatCompactCount(data.channelMeta.subs)}</div>
                </div>
                <div className="flex flex-col gap-4 items-start">
                <div className={`flex flex-col gap-3 items-start w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '180ms' }}>
                  <img src={VIEWS_ICON} alt="Views" className="h-[26px] w-[26px] object-contain" />
                  <div className="font-bold text-[19px] text-black">VIEWS</div>
                </div>
                <div className={`font-semibold text-[50px] text-black w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '290ms' }}>{formatCompactCount(data.channelMeta.views)}</div>
                </div>
                <div className="flex flex-col gap-4 items-start">
                <div className={`flex flex-col gap-3 items-start w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '210ms' }}>
                  <img src={VIDEOS_ICON} alt="Videos" className="h-[26px] w-[26px] object-contain" />
                  <div className="font-bold text-[19px] text-black">VIDEOS</div>
                </div>
                <div className={`font-semibold text-[50px] text-black w-full transition-all duration-500 ease-out ${metaAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '320ms' }}>{formatCompactCount(data.channelMeta.videoCount)}</div>
                </div>
              </div>
            </div>
            </div>
          </div>
          {/* Billing Modal */}
          <BillingModal open={showBilling} onClose={() => { setShowBilling(false); setPauseTimer(false); }} channelId={channelId!} />
        </div>
      )}
    </div>
  );
}


