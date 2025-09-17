"use client";

import { useEffect, useMemo, useState } from "react";

type Competitor = {
  id?: string;
  competitor_channel_id: string;
  competitor_title?: string | null;
  metadata?: any;
  created_at?: string;
};

type Metrics = {
  avgVpd: number;
  topVideos: Array<{ id: string; title: string; publishedAt: string; views: number; vpd: number }>;
  topicHitRates: Array<{ keyword: string; avgVpd: number; count: number }>;
  sampleSize: number;
};

export default function CompetitorsManager({ channelId }: { channelId: string }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<Competitor[]>([]);
  const [query, setQuery] = useState("");
  const [resolving, setResolving] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const CACHE_KEY = `competitorsMetrics:${channelId}`;
  const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
  const maxReached = list.length >= 5;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/competitors?channelId=${encodeURIComponent(channelId)}`);
        const json = await res.json();
        setList(json?.competitors || []);
      } catch {}
      setLoading(false);
    })();
  }, [channelId]);

  function loadCachedMetrics(): Record<string, Metrics> | null {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.updatedAt || !parsed?.data) return null;
      const fresh = Date.now() - Number(parsed.updatedAt) < CACHE_TTL_MS;
      return fresh ? (parsed.data as Record<string, Metrics>) : null;
    } catch { return null; }
  }

  function saveCachedMetrics(data: Record<string, Metrics>) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ updatedAt: Date.now(), data }));
    } catch {}
  }

  async function refreshMetrics() {
    try {
      const res = await fetch(`/api/competitors/metrics?channelId=${encodeURIComponent(channelId)}`);
      const json = await res.json();
      const map: Record<string, Metrics> = {};
      for (const r of json?.results || []) {
        map[r.competitor_channel_id] = r.metrics;
      }
      setMetrics(map);
      saveCachedMetrics(map);
    } catch {}
  }

  useEffect(() => {
    if (list.length === 0) return;
    const cached = loadCachedMetrics();
    if (cached) {
      setMetrics(cached);
      // Do not refresh immediately; rely on server TTL. Optionally, background revalidate if cache incomplete.
      const missing = list.some(c => !cached[c.competitor_channel_id]);
      if (missing) {
        refreshMetrics();
      }
    } else {
      refreshMetrics();
    }
  }, [list]);

  async function handleResolve() {
    if (!query.trim()) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/competitors/resolve?channelId=${encodeURIComponent(channelId)}&q=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      setResults(json?.results || []);
    } catch {}
    setResolving(false);
  }

  async function addCompetitor(id: string) {
    try {
      const res = await fetch(`/api/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, competitorChannelId: id })
      });
      const json = await res.json();
      if (json?.competitor) {
        setList((prev) => [json.competitor, ...prev].slice(0, 5));
        setResults([]);
        setQuery("");
      } else if (json?.error) {
        alert(json.error);
      }
    } catch {}
  }

  async function removeCompetitor(id: string) {
    try {
      const res = await fetch(`/api/competitors?channelId=${encodeURIComponent(channelId)}&competitorChannelId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json?.success) {
        setList((prev) => prev.filter((c) => c.competitor_channel_id !== id));
      }
    } catch {}
  }

  const canAdd = !maxReached && !loading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Paste channel URL, ID (UC...), or search by name"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-base"
        />
        <button onClick={handleResolve} disabled={resolving} className="px-4 py-2 rounded-md bg-black text-white text-base disabled:opacity-50">Resolve</button>
      </div>

      {results.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-white rounded overflow-hidden flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r?.thumbnails?.default?.url || r?.thumbnails?.medium?.url || r?.thumbnails?.high?.url || "/logo.svg"}
                    alt="thumb"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/logo.svg"; }}
                  />
                </div>
                <div className="truncate">
                  <div className="font-medium text-gray-900 truncate">{r.title}</div>
                  <div className="text-sm text-gray-500 truncate">{r.id}</div>
                </div>
              </div>
              <button
                onClick={() => addCompetitor(r.id)}
                disabled={!canAdd}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm hover:bg-gray-100 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ))}
          {maxReached && (
            <div className="text-sm text-red-600">You can add up to 5 competitors.</div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="text-sm text-gray-600">Added competitors ({list.length}/5)</div>
        {loading ? (
          <div className="text-gray-500 text-sm">Loading...</div>
        ) : list.length === 0 ? (
          <div className="text-gray-500 text-sm">No competitors yet.</div>
        ) : (
          <div className="space-y-4">
            {list.map((c) => (
              <div key={c.competitor_channel_id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{c.competitor_title || c.competitor_channel_id}</div>
                    <div className="text-sm text-gray-500 truncate">{c.competitor_channel_id}</div>
                  </div>
                  <button onClick={() => removeCompetitor(c.competitor_channel_id)} className="text-sm text-red-600 hover:text-red-800">Remove</button>
                </div>
                {/* Metrics */}
                {metrics[c.competitor_channel_id] ? (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-sm text-gray-600">Avg views/day (last 10)</div>
                      <div className="text-xl font-bold">{metrics[c.competitor_channel_id].avgVpd.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Sample: {metrics[c.competitor_channel_id].sampleSize} videos</div>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-sm text-gray-600 mb-1">Top 3 recent</div>
                      <ul className="space-y-1">
                        {metrics[c.competitor_channel_id].topVideos.map(v => (
                          <li key={v.id} className="text-sm text-gray-800 truncate">{v.title} <span className="text-gray-500">— {Math.round(v.vpd).toLocaleString()} vpd</span></li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-sm text-gray-600 mb-1">Topic hit rates</div>
                      <ul className="space-y-1">
                        {metrics[c.competitor_channel_id].topicHitRates.map(t => (
                          <li key={t.keyword} className="text-sm text-gray-800 truncate">{t.keyword} <span className="text-gray-500">— {Math.round(t.avgVpd).toLocaleString()} vpd</span></li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-gray-500">Loading…</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


