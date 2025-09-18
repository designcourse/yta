"use client";

import { useEffect, useMemo, useState } from 'react';

export default function ChannelTrendsPage({ params }: { params: Promise<{ channelId: string }> }) {
  const [channelId, setChannelId] = useState<string>('');
  const [items, setItems] = useState<Array<{ title: string; url: string; source: string }>>([]);
  const [fetchedAt, setFetchedAt] = useState<string | undefined>(undefined);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);
  const [stale, setStale] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    params.then((p) => setChannelId(decodeURIComponent(p.channelId)));
  }, [params]);

  const remainingMs = useMemo(() => {
    if (!expiresAt) return 0;
    const ms = Date.parse(expiresAt) - Date.now();
    return Math.max(0, ms);
  }, [expiresAt]);

  const refreshDisabled = remainingMs > 0;

  const remainingLabel = useMemo(() => {
    if (!remainingMs) return '';
    const mins = Math.ceil(remainingMs / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [remainingMs]);

  const load = async () => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trends?channelId=${encodeURIComponent(channelId)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load trends');
      setItems(Array.isArray(json.items) ? json.items : []);
      setFetchedAt(json.fetchedAt);
      setExpiresAt(json.expiresAt);
      setStale(!!json.stale);
    } catch (e: any) {
      setError(e?.message || 'Failed to load trends');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (channelId) load();
  }, [channelId]);

  const onRefresh = async () => {
    if (!channelId || refreshDisabled) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to refresh');
      setItems(Array.isArray(json.items) ? json.items : []);
      setFetchedAt(json.fetchedAt);
      setExpiresAt(json.expiresAt);
      setStale(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to refresh trends');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Niche Trends</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-60">{fetchedAt ? `Last updated: ${new Date(fetchedAt).toLocaleString()}` : ''}</span>
          <button
            className={`px-3 py-1 rounded border ${refreshDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={refreshDisabled || refreshing}
            onClick={onRefresh}
            title={refreshDisabled ? `Refresh available in ${remainingLabel}` : 'Refresh trends'}
          >
            {refreshing ? 'Refreshing…' : refreshDisabled ? `Refresh in ${remainingLabel}` : 'Refresh'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-[120px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
      ) : error ? (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-sm opacity-60">No trends available yet.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((t, idx) => (
            <li key={idx} className="border rounded p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs opacity-60">[{t.source}]</div>
                </div>
                <a className="text-sm underline" href={t.url} target="_blank" rel="noreferrer">Open</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


