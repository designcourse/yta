'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NeriaResponse from '@/components/NeriaResponse';

type PreviewPayload = {
  channel: { id: string; title: string; description: string; subs: number; views: number; videoCount: number; publishedAt: string };
  analytics90d: { baseline: { ctrMedian: number; avgPctMedian: number } };
  winners: Array<{ id: string; title: string; thumb: string; publishedAt: string; duration: string; metrics: { views: number; watchTime: number; avgViewDur: number; avgViewPct: number; impressions: number; ctr: number; subsGained: number; viewsPerDay: number } }>;
  loserIds: string[];
  slide1Text?: string;
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

  useEffect(() => {
    if (!channelId) {
      router.push('/dashboard');
      return;
    }
    const fetchPreview = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/collection/preview?channelId=${encodeURIComponent(channelId)}&refresh=1`, { cache: 'no-store' });
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

  // Reset slide 1 completion state when returning to it
  useEffect(() => {
    if (activeSlide === 0) {
      setSlide1Done(false);
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
    } else {
      start = performance.now();
      duration = DEFAULT_SLIDE_DURATION_MS;
      raf = requestAnimationFrame(animate);
      return () => { if (raf) cancelAnimationFrame(raf); };
    }
  }, [data, activeSlide, userInteractedAt, pauseTimer, prefersReduced, slide1Done]);

  const onDotClick = (index: number) => {
    setUserInteractedAt(Date.now());
    setActiveSlide(index);
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
  };

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
          {/* Top: Pagination + Neria response */}
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

            {/* Neria Response Container (Slide 1 content only for now) */}
            <div className="content-stretch flex items-center justify-center w-full">
              <div className="w-full">
                <NeriaResponse
                  response={
                    activeSlide === 0
                      ? (data.slide1Text || `I was able to gather some valuable insights into your channel, ${data.channel.title}. I’m confident we can work together to help your channel grow.`)
                      : 'Coming soon'
                  }
                  isVisible={activeSlide === 0}
                  onComplete={() => setSlide1Done(true)}
                />
              </div>
            </div>
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


