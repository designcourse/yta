"use client";

import { useEffect, useState } from "react";

type PrepublishData = {
  status: string;
  analyzed_at?: string | null;
  summary?: string | null;
  analysis_json?: Record<string, any> | null;
};

export default function PrepublishAnalysisCard({ 
  planId, 
  videoId,
  channelId 
}: { 
  planId?: string;
  videoId?: string;
  channelId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PrepublishData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (planId) params.set('planId', planId);
        if (videoId) params.set('videoId', videoId);
        
        const res = await fetch(`/api/videos/prepublish?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed with status ${res.status}`);
        }
        const json = await res.json();
        if (cancelled) return;
        if (!json.video) {
          setData(null);
          return;
        }
        setData({
          status: json.video.status,
          analyzed_at: json.video.analyzed_at,
          summary: json.analysis?.summary ?? json.video.error ?? null,
          analysis_json: json.analysis?.analysis_json ?? null,
        });
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Failed to load analysis");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (planId || videoId) {
      load();
    } else {
      setLoading(false);
      setData(null);
    }
    
    return () => {
      cancelled = true;
    };
  }, [planId, videoId]);

  if (loading) {
    return (
      <div className="border rounded-lg bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-700">Pre-publish analysis</h4>
        <p className="text-sm text-gray-500 mt-2">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-lg bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-700">Pre-publish analysis</h4>
        <p className="text-sm text-red-600 mt-2">{error}</p>
      </div>
    );
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !channelId) return;

    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      // 1. Init upload
      const initRes = await fetch('/api/videos/prepublish/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, fileName: file.name, contentType: file.type }),
      });
      if (!initRes.ok) throw new Error('Failed to init upload');
      const { uploadUrl, key } = await initRes.json();

      // 2. Upload to S3
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable) {
          setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      });

      await new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(null);
          else reject(new Error(`S3 upload failed: ${xhr.status}`));
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // 3. Commit and analyze
      const commitRes = await fetch('/api/videos/prepublish/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          videoId,
          key,
          mime: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!commitRes.ok) throw new Error('Failed to commit upload');

      // 4. Start polling
      setData({ status: 'analyzing', analyzed_at: null, summary: null, analysis_json: null });
      pollStatus();
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const pollStatus = () => {
    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        if (planId) params.set('planId', planId);
        if (videoId) params.set('videoId', videoId);
        
        const res = await fetch(`/api/videos/prepublish?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (json.video && (json.video.status === 'ready' || json.video.status === 'error')) {
          setData({
            status: json.video.status,
            analyzed_at: json.video.analyzed_at,
            summary: json.analysis?.summary ?? json.video.error ?? null,
            analysis_json: json.analysis?.analysis_json ?? null,
          });
          clearInterval(interval);
          setReanalyzing(false);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 3000);
  };

  const handleReanalyze = async () => {
    if ((!planId && !videoId) || reanalyzing) return;
    
    setReanalyzing(true);
    setError(null);
    
    try {
      const body: any = {};
      if (planId) body.planId = planId;
      if (videoId) body.videoId = videoId;
      
      const res = await fetch('/api/videos/prepublish/reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with status ${res.status}`);
      }
      
      // Update status to analyzing and start polling
      setData({ status: 'analyzing', analyzed_at: null, summary: null, analysis_json: null });
      pollStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to start re-analysis');
      setReanalyzing(false);
    }
  };

  if (!data) {
    return (
      <div className="border rounded-lg bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-700">AI Video Analysis</h4>
        <p className="text-sm text-gray-600 mt-2">
          Upload your rough cut video to get AI-powered insights on hook strength, pacing, energy, and more.
        </p>
        
        {uploadError && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {uploadError}
          </div>
        )}

        {uploading ? (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span>Uploading... {uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>Upload Video</span>
            <input 
              type="file" 
              accept="video/*" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={!channelId}
            />
          </label>
        )}
      </div>
    );
  }

  const analysis = data.analysis_json || {};

  const hookScore = pickNumber([
    analysis.hook_strength,
    analysis.hook_score,
    analysis.scores?.hook_strength,
    analysis.scores?.hook
  ]);
  const pacingScore = pickNumber([
    analysis.pacing_score,
    analysis.pacing,
    analysis.scores?.pacing
  ]);
  const energyScore = pickNumber([
    analysis.energy_score,
    analysis.energy,
    analysis.scores?.energy
  ]);
  const visualScore = pickNumber([
    analysis.visual_engagement_score,
    analysis.visual_engagement,
    analysis.scores?.visual_engagement,
    analysis.scores?.visual
  ]);

  const pacingMetrics = analysis.pacing_metrics || analysis.metrics || null;
  const flatSpots = Array.isArray(analysis.flat_spots) ? analysis.flat_spots : [];
  const rawMoments = Array.isArray(analysis.moments)
    ? analysis.moments
    : Array.isArray(analysis.highlight_moments)
      ? analysis.highlight_moments
      : [];
  const moments = rawMoments
    .map((moment: any) => {
      const time = pickNumber([moment.time_sec, moment.time, moment.timestamp_sec, moment.second_mark]);
      const label = typeof moment.caption === "string" && moment.caption.trim().length > 0
        ? moment.caption.trim()
        : (typeof moment.title === "string" && moment.title.trim().length > 0
          ? moment.title.trim()
          : (typeof moment.type === "string" ? moment.type.trim() : ""));
      if (time == null) return null;
      return { time, label };
    })
    .filter(Boolean) as Array<{ time: number; label: string }>;

  moments.sort((a, b) => a.time - b.time);

  return (
    <div className="border rounded-lg bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-700">Pre-publish analysis</h4>
          <p className="text-xs text-gray-500">Latest status: <span className="font-medium text-gray-700">{data.status}</span>{data.analyzed_at ? ` • ${new Date(data.analyzed_at).toLocaleString()}` : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {(planId || videoId) && (
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {reanalyzing ? (
                <>
                  <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" />
                  <span>Re-analyzing...</span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Re-analyze</span>
                </>
              )}
            </button>
          )}
          <a
            href={`/api/videos/prepublish?${planId ? `planId=${encodeURIComponent(planId)}` : videoId ? `videoId=${encodeURIComponent(videoId)}` : ''}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-600 hover:text-indigo-700"
          >
            View raw JSON →
          </a>
        </div>
      </div>

      {(hookScore ?? pacingScore ?? energyScore ?? visualScore) !== undefined && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {hookScore != null && <ScoreCard label="Hook" value={hookScore} />}
          {pacingScore != null && <ScoreCard label="Pacing" value={pacingScore} />}
          {energyScore != null && <ScoreCard label="Energy" value={energyScore} />}
          {visualScore != null && <ScoreCard label="Visual" value={visualScore} />}
        </div>
      )}

      {(() => {
        if (!pacingMetrics) return null;
        const words = pickNumber([pacingMetrics.words_per_minute, pacingMetrics.words_per_min, pacingMetrics.words_per_minute_avg]);
        const cuts = pickNumber([pacingMetrics.cuts_per_minute, pacingMetrics.cuts_per_min]);
        const shot = pickNumber([pacingMetrics.average_shot_length_sec, pacingMetrics.shot_length_sec]);
        const slow = pickNumber([pacingMetrics.slow_start_sec, pacingMetrics.slow_start_seconds]);
        const hasMetrics = [words, cuts, shot, slow].some((v) => v != null);
        if (!hasMetrics) return (
          <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-500">
            <p className="font-semibold text-gray-700 mb-1">Pacing metrics</p>
            Gemini didn’t return detailed pacing metrics for this upload.
          </div>
        );
        return (
          <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700">Pacing metrics</p>
            <MetricRow label="Words/min" value={words} suffix="wpm" />
            <MetricRow label="Cuts/min" value={cuts} />
            <MetricRow label="Avg shot length" value={shot} suffix="sec" />
            <MetricRow label="Slow start" value={slow} suffix="sec" />
          </div>
        );
      })()}

      {flatSpots.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Flat spots to tighten</p>
          <ul className="space-y-1 text-xs text-gray-600">
            {flatSpots.slice(0, 4).map((spot, idx) => (
              <li key={idx} className="bg-gray-50 rounded px-2 py-1">
                <span className="font-medium text-gray-700">{formatTime(parseTime(spot.start_sec ?? spot.start ?? spot.begin ?? spot.time))}–{formatTime(parseTime(spot.end_sec ?? spot.end ?? spot.finish))}</span>
                {spot.reason ? ` • ${spot.reason}` : ''}
              </li>
            ))}
            {flatSpots.length > 4 && <li className="text-gray-400">+{flatSpots.length - 4} more</li>}
          </ul>
        </div>
      )}

      {moments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Highlight moments</p>
          <ul className="space-y-1 text-xs text-gray-600">
            {moments.slice(0, 4).map((moment, idx) => (
              <li key={idx} className="bg-indigo-50 rounded px-2 py-1">
                <span className="font-medium text-indigo-700">{formatTime(moment.time)}</span>
                {moment.label ? ` • ${moment.label}` : ""}
              </li>
            ))}
            {moments.length > 4 && <li className="text-indigo-300">+{moments.length - 4} more</li>}
          </ul>
        </div>
      )}

      {data.summary && (
        <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700 whitespace-pre-line">
          {data.summary}
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-md p-3 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{Number.isFinite(value) ? value.toFixed(1) : value}</p>
      <p className="text-[11px] text-gray-400">/ 10</p>
    </div>
  );
}

function MetricRow({ label, value, suffix }: { label: string; value?: number; suffix?: string }) {
  if (value == null) return null;
  return (
    <p>
      <span className="font-medium text-gray-700">{label}:</span> {Number.isFinite(value) ? value.toFixed(1) : value}
      {suffix ? ` ${suffix}` : ""}
    </p>
  );
}

function formatTime(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "?";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function pickNumber(values: Array<any>): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return undefined;
}

function parseTime(value: any): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) return numeric;

    const parts = trimmed.split(":");
    if (parts.length >= 2 && parts.every((p) => p !== "" && !Number.isNaN(Number(p)))) {
      let total = 0;
      let multiplier = 1;
      for (let i = parts.length - 1; i >= 0; i--) {
        total += Number(parts[i]) * multiplier;
        multiplier *= 60;
      }
      return total;
    }

    const match = trimmed.match(/(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)(?:s)?)?/i);
    if (match) {
      const hours = Number(match[1] || 0);
      const minutes = Number(match[2] || 0);
      const seconds = Number(match[3] || 0);
      if (!Number.isNaN(hours) && !Number.isNaN(minutes) && !Number.isNaN(seconds)) {
        return hours * 3600 + minutes * 60 + seconds;
      }
    }
  }
  return undefined;
}

