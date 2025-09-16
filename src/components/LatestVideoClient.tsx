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
  const [recent, setRecent] = useState<Array<any>>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<any | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [dismissRescue, setDismissRescue] = useState(false);

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
      // Load KPIs after snapshot available
      fetchKpis();
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
        setKpis(null);
      }
    } catch {
      setKpis(null);
    } finally {
      setKpisLoading(false);
    }
  };

  const handleRefresh = () => {
    setShowContainer(false);
    fetchLatestVideo(true);
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
            onChange={(e) => { const next = e.target.value || null; setSelectedVideoId(next); fetchKpis(next); }}
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

          {/* KPIs vs Baselines */}
          <div className="mt-8 bg-white border border-white/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-black font-medium">KPIs vs Baselines (comparable set)</h3>
              <button
                className="text-sm text-blue-600 hover:text-blue-700"
                onClick={() => { fetchKpis(); }}
                disabled={kpisLoading}
              >{kpisLoading ? 'Refreshing…' : 'Refresh KPIs'}</button>
            </div>
            {!kpis && !kpisLoading && (
              <div className="text-black/70 text-sm">No KPIs yet. Click Refresh KPIs.</div>
            )}
            {kpis && (
              <div className="text-sm text-black space-y-2">
                <div className="text-black/70">Comparable set: {kpis?.comparable?.count ?? 0} • format {kpis?.comparable?.dims?.format} • length {kpis?.comparable?.dims?.lengthBand || '—'} • confidence {kpis?.comparable?.confidence}</div>
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


