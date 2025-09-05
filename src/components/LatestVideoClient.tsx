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
  const [insights, setInsights] = useState<any | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [recent, setRecent] = useState<Array<any>>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

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
      setTimeout(() => setShowContainer(true), 50);
      // Load insights after snapshot available
      fetchInsights();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching latest video:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInsights = async () => {
    if (!channelId) return;
    try {
      setInsightsLoading(true);
      const url = selectedVideoId
        ? `/api/latest-video-insights?channelId=${encodeURIComponent(channelId)}&videoId=${encodeURIComponent(selectedVideoId)}`
        : `/api/latest-video-insights?channelId=${encodeURIComponent(channelId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        setInsights(j);
      } else {
        setInsights(null);
      }
    } catch (e) {
      setInsights(null);
    } finally {
      setInsightsLoading(false);
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

      {/* Debug dropdown for last 10 videos */}
      {recent.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-black/80">Debug: Select video</label>
          <select
            className="text-sm border rounded px-2 py-1"
            value={selectedVideoId || ''}
            onChange={(e) => { setSelectedVideoId(e.target.value || null); fetchInsights(); }}
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
          {/* Insights Section */}
          <div className="mt-8 bg-white border border-white/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-black font-medium">Retention & Transcript Insights</h3>
              <button
                className="text-sm text-blue-600 hover:text-blue-700"
                onClick={fetchInsights}
                disabled={insightsLoading}
              >{insightsLoading ? 'Refreshing…' : 'Refresh insights'}</button>
            </div>
            {!insights && !insightsLoading && (
              <div className="text-black/70 text-sm">No insights yet. Click Refresh insights.</div>
            )}
            {insightsLoading && (
              <div className="text-black/70 text-sm">Analyzing latest video…</div>
            )}
            {insights && (
              <div className="space-y-3 text-sm text-black">
                {insights.hookExcerpt && (
                  <div className="bg-gray-50 rounded p-3 border border-gray-200">
                    <div className="font-medium mb-1">Hook Transcript (first ~20s)</div>
                    <div className="text-gray-700">{insights.hookExcerpt}</div>
                  </div>
                )}
                {/* Simple retention chart (relativeRetentionPerformance) */}
                {Array.isArray(insights.retention) && insights.retention.length > 0 && (
                  <div className="bg-gray-50 rounded p-3 border border-gray-200">
                    <div className="font-medium mb-2">Relative Retention Timeline</div>
                    <div className="w-full h-24 flex items-end gap-1">
                      {insights.retention.map((r: any, idx: number) => {
                        const pct = Number(String(r[0]).replace('%',''));
                        const val = typeof r[2] === 'number' ? r[2] : 0; // rrp
                        const h = Math.max(2, Math.min(96, Math.round(val * 80)));
                        return (
                          <div key={idx} title={`${pct}% • ${val.toFixed ? val.toFixed(2) : val}`}
                            className="bg-blue-500" style={{ width: '1.5%', height: `${h}px` }} />
                        );
                      })}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Bars reflect relativeRetentionPerformance (1.0 = average peers)</div>
                  </div>
                )}
                {Array.isArray(insights.insights) && insights.insights.length > 0 ? (
                  insights.insights.map((it: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 rounded p-3 border border-gray-200">
                      <div className="text-black font-medium">{new Date(it.time * 1000).toISOString().substr(11, 8)} (≈{Math.round(it.pct)}%)</div>
                      <div className="mt-1 text-gray-800">{it.insight}</div>
                      <div className="mt-1 text-blue-700">Suggestion: {it.suggestion}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-black/70">No actionable points detected.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


