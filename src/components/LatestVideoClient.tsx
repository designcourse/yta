"use client";

import RefreshContainer from "@/components/RefreshContainer";
import LastVideoContainer from "@/components/LastVideoContainer";
import EarlyMetricsCard from "@/components/EarlyMetricsCard";
import EarlyMetricsProgress from "@/components/EarlyMetricsProgress";
import PrepublishAnalysisCard from "@/components/PrepublishAnalysisCard";
import RetentionChart from "@/components/RetentionChart";
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

interface BucketInfo {
  id: string;
  key: string;
  label: string;
  description?: string;
}

export default function LatestVideoClient({ channelId }: { channelId: string }) {
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [bucketInfo, setBucketInfo] = useState<BucketInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContainer, setShowContainer] = useState(false);
  const [recent, setRecent] = useState<Array<any>>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<any | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [dismissRescue, setDismissRescue] = useState(false);
  const [retentionData, setRetentionData] = useState<{ 
    retention: Array<[string, number, number?]>; 
    durationSec: number;
    insights?: Array<{ time: number | string; pct: number; insight: string; suggestion: string }>;
  } | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [prepublishData, setPrepublishData] = useState<{
    highlightMoments?: Array<{ time: number | string; caption?: string; title?: string }>;
    flatSpots?: Array<{ time: string; duration?: string; issue?: string }>;
  } | null>(null);

  useEffect(() => {
    if (channelId) {
      fetchLatestVideo();
      // load recent list
      fetch(`/api/channel-recent-videos?channelId=${encodeURIComponent(channelId)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(j => setRecent(Array.isArray(j.videos) ? j.videos : []))
        .catch(() => setRecent([]));
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
      setBucketInfo(data.bucket);
      setOriginalBucketInfo(data.bucket);
      setTimeout(() => setShowContainer(true), 50);
      // Load KPIs and retention after snapshot available
      fetchKpis();
      fetchRetention();
      if (data.video?.video_id) {
        fetchPrepublish(data.video.video_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching latest video:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchKpis = async (overrideVideoId?: string | null) => {
    if (!channelId) return;
    try {
      setKpisLoading(true);
      const id = overrideVideoId !== undefined ? overrideVideoId : selectedVideoId;
      const url = id
        ? `/api/dashboard/kpis?channelId=${encodeURIComponent(channelId)}&videoId=${encodeURIComponent(id)}`
        : `/api/dashboard/kpis?channelId=${encodeURIComponent(channelId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        setKpis(j);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('KPIs API Error:', errorData);
        setKpis({ 
          error: true, 
          message: errorData.error || 'Failed to fetch KPIs',
          details: errorData.details || 'Unknown error occurred'
        });
      }
    } catch (error) {
      console.error('Error fetching KPIs:', error);
      setKpis({ 
        error: true, 
        message: 'Network error', 
        details: 'Failed to connect to KPIs API'
      });
    } finally {
      setKpisLoading(false);
    }
  };

  const fetchRetention = async (overrideVideoId?: string | null) => {
    if (!channelId) return;
    try {
      setRetentionLoading(true);
      setRetentionData(null);
      const id = overrideVideoId !== undefined ? overrideVideoId : selectedVideoId;
      const url = id
        ? `/api/latest-video-insights?channelId=${encodeURIComponent(channelId)}&videoId=${encodeURIComponent(id)}`
        : `/api/latest-video-insights?channelId=${encodeURIComponent(channelId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        if (j.retention && Array.isArray(j.retention) && j.retention.length > 0 && j.durationSec) {
          setRetentionData({ 
            retention: j.retention, 
            durationSec: j.durationSec,
            insights: Array.isArray(j.insights) ? j.insights : undefined
          });
        } else {
          setRetentionData(null);
        }
      } else {
        setRetentionData(null);
      }
    } catch (error) {
      console.error('Error fetching retention:', error);
      setRetentionData(null);
    } finally {
      setRetentionLoading(false);
    }
  };

  const fetchPrepublish = async (videoId: string) => {
    try {
      console.log('[Prepublish] Fetching for videoId:', videoId);
      const res = await fetch(`/api/videos/prepublish?videoId=${videoId}`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        console.log('[Prepublish] API response:', j);
        if (j.analysis?.analysis_json) {
          const analysis = j.analysis.analysis_json;
          console.log('[Prepublish] Analysis JSON:', analysis);
          
          // Transform moments data for RetentionChart
          const rawMoments = analysis.moments || analysis.highlight_moments || [];
          console.log('[Prepublish] Raw moments:', rawMoments);
          const highlightMoments = rawMoments.map((m: any) => ({
            time: m.time,
            caption: m.caption || m.label || m.title,
            title: m.title || m.caption || m.label
          }));
          
          // Transform flat_spots data for RetentionChart
          const rawFlats = analysis.flat_spots || [];
          console.log('[Prepublish] Raw flat spots:', rawFlats);
          const flatSpots = rawFlats.map((f: any) => {
            const start = f.start_sec ?? f.start ?? f.begin ?? f.time;
            const end = f.end_sec ?? f.end ?? f.finish;
            return {
              time: String(start),
              duration: end ? `${end - start}s` : undefined,
              issue: f.reason || f.issue
            };
          });
          
          console.log('[Prepublish] Transformed data:', { highlightMoments, flatSpots });
          setPrepublishData({
            highlightMoments,
            flatSpots
          });
        } else {
          console.log('[Prepublish] No analysis_json found');
          setPrepublishData(null);
        }
      } else {
        console.log('[Prepublish] API returned non-OK status:', res.status);
        setPrepublishData(null);
      }
    } catch (error) {
      console.error('[Prepublish] Error fetching prepublish data:', error);
      setPrepublishData(null);
    }
  };

  const [originalBucketInfo, setOriginalBucketInfo] = useState<BucketInfo | null>(null);

  const handleRefresh = () => {
    setShowContainer(false);
    fetchLatestVideo(true);
  };

  // Fetch bucket info for a specific video
  const fetchBucketInfo = async (videoId: string) => {
    try {
      const response = await fetch(`/api/video-bucket?channelId=${encodeURIComponent(channelId)}&videoId=${encodeURIComponent(videoId)}`);
      if (response.ok) {
        const data = await response.json();
        setBucketInfo(data.bucket);
      } else {
        setBucketInfo(null);
      }
    } catch (error) {
      console.error('Error fetching bucket info:', error);
      setBucketInfo(null);
    }
  };

  // Compute early-velocity rescue signal (proxy until CTR_1h available)
  const rescue = (() => {
    try {
      if (!videoData || !kpis || dismissRescue) return null;
      // Determine the publishedAt for the card being shown
      let publishedAtISO: string | null = videoData.published_at || null;
      if (selectedVideoId && recent.length > 0) {
        const sel = recent.find(v => v.id === selectedVideoId);
        if (sel?.publishedAt) publishedAtISO = sel.publishedAt;
      }
      if (!publishedAtISO) return null;
      const hoursSince = Math.max(0.01, (Date.now() - new Date(publishedAtISO).getTime()) / 3600000);
      // Only evaluate rescue in the first 24h window; avoid ultra-early jitter < 30m
      if (hoursSince < 0.5 || hoursSince > 24) return null;
      const currentViews = (selectedVideoId && recent.length > 0)
        ? (recent.find(v => v.id === selectedVideoId)?.viewCount || 0)
        : (videoData.view_count || 0);
      const vph = currentViews / hoursSince;
      const baseVpd = kpis?.baselines?.vpd_24h;
      if (!baseVpd || baseVpd.q1 == null) return null;
      const vphP25 = baseVpd.q1 / 24;
      // Guard: do not suggest rescue if AVD penalty is likely (below lower threshold)
      const baseAvd = kpis?.baselines?.avd_24h;
      const curAvd = kpis?.current?.avd_24h as number | null | undefined;
      let noAvdPenalty = true;
      if (baseAvd && typeof curAvd === 'number') {
        const lower = baseAvd.median - 0.5 * baseAvd.iqr;
        noAvdPenalty = curAvd >= lower;
      }
      if (Number.isFinite(vph) && Number.isFinite(vphP25) && vph < vphP25 && noAvdPenalty) {
        return { hoursSince, vph, vphP25 };
      }
      return null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-6">
      <RefreshContainer 
        lastUpdated={videoData?.stats_retrieved_at}
        onRefresh={handleRefresh}
        isLoading={isLoading}
      />

      {/* Debug dropdown for last 10 videos */}
      {recent.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-black/80">Debug: Select video</label>
          <select
            className="text-sm border rounded px-2 py-1"
            value={selectedVideoId || ''}
            onChange={(e) => { 
              const next = e.target.value || null; 
              setSelectedVideoId(next); 
              fetchKpis(next);
              fetchRetention(next);
              if (next) {
                fetchBucketInfo(next);
                fetchPrepublish(next);
              } else {
                // Reset to original bucket info when selecting "Latest"
                setBucketInfo(originalBucketInfo);
                setPrepublishData(null);
              }
            }}
          >
            <option value="">Latest</option>
            {recent.map((v) => (
              <option key={v.id} value={v.id}>{new Date(v.publishedAt).toISOString().slice(0,10)} — {v.title}</option>
            ))}
          </select>
        </div>
      )}

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
          {selectedVideoId && recent.length > 0 ? (
            (() => {
              const sel = recent.find(v => v.id === selectedVideoId);
              if (!sel) return <LastVideoContainer videoData={videoData} />;
              const mapped = {
                video_id: sel.id,
                video_title: sel.title,
                thumbnail_url: sel.thumbnails?.high?.url || sel.thumbnails?.medium?.url || sel.thumbnails?.default?.url,
                view_count: sel.viewCount || 0,
                comment_count: sel.commentCount || 0,
                published_at: sel.publishedAt,
                stats_retrieved_at: new Date().toISOString(),
              } as any;
              return <LastVideoContainer videoData={mapped} />;
            })()
          ) : (
            <LastVideoContainer videoData={videoData} />
          )}

          {/* Early Metrics Progress Bar */}
          <div className="mt-6">
            <EarlyMetricsProgress 
              publishedAt={
                selectedVideoId && recent.length > 0
                  ? (recent.find(v => v.id === selectedVideoId)?.publishedAt || videoData.published_at)
                  : videoData.published_at
              }
            />
          </div>

          {/* Early Metrics (3-hour snapshot) */}
          <div className="mt-6">
            <EarlyMetricsCard 
              channelId={channelId}
              videoId={selectedVideoId || videoData.video_id}
              publishedAt={
                selectedVideoId && recent.length > 0
                  ? (recent.find(v => v.id === selectedVideoId)?.publishedAt || videoData.published_at)
                  : videoData.published_at
              }
            />
          </div>

          {/* Content Bucket Info */}
          {bucketInfo && (
            <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900">Content Bucket</h4>
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                      {bucketInfo.key}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    <span className="font-medium">{bucketInfo.label}</span>
                    {bucketInfo.description && (
                      <span className="text-gray-600 ml-2">• {bucketInfo.description}</span>
                    )}
                  </div>
                </div>
                <a 
                  href={`/dashboard/${channelId}/buckets`}
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  View All Buckets →
                </a>
              </div>
            </div>
          )}

          {/* KPIs vs Baselines */}
          <div className="mt-8 bg-white border border-white/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-black font-medium">KPIs vs Baselines (comparable set)</h3>
              <div className="flex items-center gap-2">
                <button
                  className="text-sm text-green-600 hover:text-green-700"
                  onClick={async () => {
                    try {
                      setKpisLoading(true);
                      const response = await fetch('/api/refresh-metrics', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ channelId }),
                      });
                      if (response.ok) {
                        // After refreshing metrics, refresh KPIs
                        await fetchKpis();
                      } else {
                        console.error('Failed to refresh metrics');
                      }
                    } catch (error) {
                      console.error('Error refreshing metrics:', error);
                    } finally {
                      setKpisLoading(false);
                    }
                  }}
                  disabled={kpisLoading}
                >
                  {kpisLoading ? 'Refreshing...' : 'Refresh Metrics'}
                </button>
                <button
                  className="text-sm text-blue-600 hover:text-blue-700"
                  onClick={() => { fetchKpis(); }}
                  disabled={kpisLoading}
                >
                  {kpisLoading ? 'Refreshing…' : 'Refresh KPIs'}
                </button>
              </div>
            </div>
            {!kpis && !kpisLoading && (
              <div className="text-black/70 text-sm">No KPIs yet. Click Refresh KPIs.</div>
            )}
            {kpis && kpis.error && (
              <div className={`border rounded-lg p-4 ${kpis.isRecent ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                <div className={`font-medium ${kpis.isRecent ? 'text-yellow-800' : 'text-red-800'}`}>
                  {kpis.isRecent ? '⏳' : '❌'} {kpis.message}
                </div>
                <div className={`text-sm mt-1 ${kpis.isRecent ? 'text-yellow-700' : 'text-red-600'}`}>
                  {kpis.details}
                </div>
                {kpis.videoAge && (
                  <div className={`text-xs mt-2 ${kpis.isRecent ? 'text-yellow-600' : 'text-red-600'}`}>
                    Video age: {kpis.videoAge}
                  </div>
                )}
                {kpis.isRecent ? (
                  <div className="text-yellow-600 text-xs mt-2">
                    ✅ YouTube Analytics API is working (verified with older videos)<br/>
                    🕒 Your video just needs more time to process - this is normal!
                  </div>
                ) : (
                  <div className="text-red-600 text-xs mt-2 space-y-2">
                    <div>
                      💡 This may be due to:
                      <ul className="list-disc list-inside mt-1">
                        <li>Missing YouTube Analytics permissions (try reconnecting your account)</li>
                        <li>API rate limits or temporary issues</li>
                        <li>Video privacy settings</li>
                      </ul>
                    </div>
                    <button
                      onClick={async () => {
                        // Clear invalid tokens first
                        try {
                          await fetch('/api/clear-youtube-tokens', { method: 'POST' });
                        } catch (e) {
                          console.error('Failed to clear tokens:', e);
                        }
                        
                        // Then open reconnect popup
                        const width = 600;
                        const height = 700;
                        const left = window.screen.width / 2 - width / 2;
                        const top = window.screen.height / 2 - height / 2;
                        const popup = window.open(
                          '/youtube-connect',
                          'youtube-connect',
                          `width=${width},height=${height},left=${left},top=${top}`
                        );
                        
                        // Listen for successful reconnection
                        const handleMessage = (event: MessageEvent) => {
                          if (event.data.type === 'youtube-connected') {
                            window.removeEventListener('message', handleMessage);
                            // Reload the page to get fresh data
                            window.location.reload();
                          }
                        };
                        window.addEventListener('message', handleMessage);
                      }}
                      className="inline-block px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
                    >
                      🔗 Reconnect YouTube Analytics
                    </button>
                    <p className="text-xs text-gray-600 mt-2">
                      This will clear old tokens and request fresh YouTube Analytics permissions.
                    </p>
                  </div>
                )}
              </div>
            )}
            {kpis && !kpis.error && (
              <div className="text-sm text-black space-y-2">
                <div className="text-black/70">
                  Comparable set: {kpis?.comparable?.count ?? 0} • format {kpis?.comparable?.dims?.format} • length {kpis?.comparable?.dims?.lengthBand || '—'} • confidence {kpis?.comparable?.confidence}
                  {kpis?.comparable?.timeNormalized && (
                    <div className="mt-1 text-blue-600 text-xs">
                      {kpis.comparable.timeNormalized.method === 'youtube_analytics' ? '🎯' : '📊'} {kpis.comparable.timeNormalized.note} • 
                      Window: {kpis.comparable.timeNormalized.timeWindow} • 
                      Source: {kpis.comparable.timeNormalized.dataSource}
                      {kpis.comparable.timeNormalized.successRate && ` • Success: ${kpis.comparable.timeNormalized.successRate}`}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { key: 'avd_24h', label: 'Avg View Duration (s)' },
                    { key: 'retention_pct', label: 'Retention (%)' },
                    { key: 'vpd_24h', label: 'Views/Day' },
                    { key: 'ctr_24h', label: 'CTR (24h)' },
                  ].map((m) => {
                    const verdict = kpis?.verdicts?.[m.key] as string | undefined;
                    const currentVal = kpis?.current?.[m.key];
                    const base = kpis?.baselines?.[m.key];
                    const badge = verdict === 'pass' ? 'bg-green-100 text-green-700 border-green-200'
                      : verdict === 'fail' ? 'bg-red-100 text-red-700 border-red-200'
                      : verdict === 'neutral' ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                      : 'bg-gray-50 text-gray-600 border-gray-200';
                    const fmt = (v: any) => v == null ? '—' : typeof v === 'number' ? (m.key === 'retention_pct' ? (Math.round(v * 100) / 100).toFixed(2) : Math.round(v * 100) / 100) : String(v);
                    return (
                      <div key={m.key} className={`border rounded p-3 ${badge}`}>
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{m.label}</div>
                          <div className="text-xs uppercase tracking-wide">{verdict || 'unknown'}</div>
                        </div>
                        <div className="mt-1 text-black/80">
                          Current: <span className="font-medium">{fmt(currentVal)}</span>
                        </div>
                        <div className="mt-0.5 text-black/70">
                          Baseline median±IQR: {base ? `${fmt(base.median)} ± ${fmt(base.iqr)}` : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Retention Chart */}
          <div className="mt-8 bg-white border border-white/20 rounded-lg p-4">
            <h3 className="text-black font-medium mb-4">Audience Retention</h3>
            {retentionLoading ? (
              <div className="flex items-center justify-center h-80">
                <div className="text-black/70 text-sm">Loading retention data...</div>
              </div>
            ) : retentionData ? (
              <RetentionChart 
                retention={retentionData.retention} 
                durationSec={retentionData.durationSec}
                insights={retentionData.insights}
                highlightMoments={prepublishData?.highlightMoments}
                flatSpots={prepublishData?.flatSpots}
              />
            ) : (
              <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-black/70 font-medium">Retention data not yet available</p>
                  <p className="text-black/50 text-sm mt-2">
                    YouTube Analytics typically provides retention data 24-48 hours after a video is published.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pre-Publish Video Analysis */}
          <div className="mt-8">
            <PrepublishAnalysisCard 
              channelId={channelId}
              videoId={selectedVideoId || videoData.video_id}
            />
          </div>

          {/* Early Rescue Prompt (proxy using views/hour vs baseline P25) */}
          {rescue && (
            <div className="mt-4 border border-yellow-300 bg-yellow-50 rounded-lg p-4 text-black">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">Rescue opportunity (packaging)</div>
                  <div className="text-sm text-black/80 mt-1">
                    Views/hour {Math.round(rescue.vph * 100) / 100} is below comparable P25 {Math.round(rescue.vphP25 * 100) / 100} within the first {Math.round(rescue.hoursSince * 10) / 10}h.
                  </div>
                  <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                    <li>Clarify the promise in the first 50 characters of the title.</li>
                    <li>Increase thumbnail subject size and contrast; reduce on-image text.</li>
                    <li>Add a specific outcome or number; avoid jargon.</li>
                  </ul>
                </div>
                <button
                  className="text-xs text-black/60 hover:text-black"
                  onClick={() => setDismissRescue(true)}
                >Dismiss</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


