"use client";

import React from 'react';

type TrendAPIResponse = {
  channelId: string;
  appliedFilters: { format: string; lengthBand: string; topicCluster: string };
  availableFilters: { formats: string[]; lengthBands: string[]; topicClusters: string[] };
  points: {
    avd_24h: { video_id: string; value: number | null }[];
    vpd_24h: { video_id: string; value: number | null }[];
    wtpi_sec: { video_id: string; value: number | null }[];
  };
  meta?: { count: number };
  error?: string;
};

interface TrendsWidgetProps {
  channelId: string;
}

function formatNumber(num: number | null | undefined): string {
  if (num == null || !Number.isFinite(num)) return '—';
  const n = Number(num);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 100_000) return Math.round(n / 1_000) + 'k';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function formatDurationSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.round(Number(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function Sparkline({ data, color = '#111827' }: { data: Array<number | null>; color?: string }) {
  const width = 260;
  const height = 60;
  const padding = 6;
  const values = data.filter((v): v is number => v != null && Number.isFinite(v));
  if (values.length === 0) {
    return (
      <div className="h-[60px] flex items-center justify-center text-sm opacity-60">No data</div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const points = data.map((v, i) => {
    const x = padding + i * stepX;
    const y = v == null || !Number.isFinite(v)
      ? null
      : padding + (height - padding * 2) - ((Number(v) - min) / range) * (height - padding * 2);
    return { x, y } as const;
  });
  const path = points.reduce<string>((acc, p, idx) => {
    if (p.y == null) return acc;
    if (acc === '') return `M ${p.x} ${p.y}`;
    return acc + ` L ${p.x} ${p.y}`;
  }, '');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TrendsWidget({ channelId }: TrendsWidgetProps) {
  const [format, setFormat] = React.useState<'all' | 'short' | 'long'>('all');
  const [lengthBand, setLengthBand] = React.useState<'all' | string>('all');
  const [topic, setTopic] = React.useState<'all' | string>('all');
  const [data, setData] = React.useState<TrendAPIResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('channelId', channelId);
      if (format) params.set('format', format);
      if (lengthBand) params.set('lengthBand', lengthBand);
      if (topic) params.set('topic', topic);
      params.set('limit', '10');
      const res = await fetch(`/api/dashboard/trends?${params.toString()}`);
      const json = (await res.json()) as TrendAPIResponse;
      if (!res.ok) throw new Error(json?.error || 'Failed to fetch');
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [channelId, format, lengthBand, topic]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">Trends (last 10 uploads)</h3>
        <div className="flex gap-2 text-sm">
          <select
            className="border rounded px-2 py-1 bg-white dark:bg-gray-900"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'all' | 'short' | 'long')}
          >
            <option value="all">All formats</option>
            <option value="long">Long</option>
            <option value="short">Shorts</option>
          </select>
          <select
            className="border rounded px-2 py-1 bg-white dark:bg-gray-900"
            value={lengthBand}
            onChange={(e) => setLengthBand(e.target.value)}
          >
            <option value="all">All lengths</option>
            {(data?.availableFilters.lengthBands || []).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            className="border rounded px-2 py-1 bg-white dark:bg-gray-900"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="all">All topics</option>
            {(data?.availableFilters.topicClusters || []).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-[120px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
      ) : error ? (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : !data ? (
        <div className="text-sm opacity-60">No data</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-md p-3">
            <div className="text-sm opacity-60 mb-1">WTPI (sec / impression)</div>
            <Sparkline data={data.points.wtpi_sec.map((p) => (p.value == null ? null : Number(p.value)))} color="#111827" />
            <div className="text-sm mt-1">Last: {formatDurationSec(data.points.wtpi_sec.at(-1)?.value ?? null)}</div>
          </div>
          <div className="border rounded-md p-3">
            <div className="text-sm opacity-60 mb-1">AVD (sec)</div>
            <Sparkline data={data.points.avd_24h.map((p) => (p.value == null ? null : Number(p.value)))} color="#2563EB" />
            <div className="text-sm mt-1">Last: {formatDurationSec(data.points.avd_24h.at(-1)?.value ?? null)}</div>
          </div>
          <div className="border rounded-md p-3">
            <div className="text-sm opacity-60 mb-1">VPD (views/day)</div>
            <Sparkline data={data.points.vpd_24h.map((p) => (p.value == null ? null : Number(p.value)))} color="#059669" />
            <div className="text-sm mt-1">Last: {formatNumber(data.points.vpd_24h.at(-1)?.value ?? null)}</div>
          </div>
        </div>
      )}
    </div>
  );
}


