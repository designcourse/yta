"use client";

import React from 'react';

type MetricKey = 'ctr_24h' | 'avd_24h' | 'vpd_24h' | 'retention_pct';

type GroupWinRates = {
  key: string;
  count: number;
  metrics: Record<MetricKey, { passRate: number | null; sample: number }>;
  overall: number | null;
};

type APIResponse = {
  channelId: string;
  byLengthBand: GroupWinRates[];
  byTopicCluster: GroupWinRates[];
  error?: string;
};

interface WinRateSummaryProps {
  channelId: string;
}

function percent(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—';
  return Math.round(p * 100) + '%';
}

function GroupTable({ title, groups }: { title: string; groups: GroupWinRates[] }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-lg font-medium mb-3">{title}</div>
      {groups.length === 0 ? (
        <div className="text-sm opacity-60">No data</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left opacity-60">
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4">Videos</th>
                <th className="py-2 pr-4">Overall</th>
                <th className="py-2 pr-4">CTR</th>
                <th className="py-2 pr-4">AVD</th>
                <th className="py-2 pr-4">VPD</th>
                <th className="py-2 pr-0">Retention%</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-t">
                  <td className="py-2 pr-4 font-medium">{g.key}</td>
                  <td className="py-2 pr-4">{g.count}</td>
                  <td className="py-2 pr-4">{percent(g.overall)}</td>
                  <td className="py-2 pr-4">{percent(g.metrics.ctr_24h.passRate)}</td>
                  <td className="py-2 pr-4">{percent(g.metrics.avd_24h.passRate)}</td>
                  <td className="py-2 pr-4">{percent(g.metrics.vpd_24h.passRate)}</td>
                  <td className="py-2 pr-0">{percent(g.metrics.retention_pct.passRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function WinRateSummary({ channelId }: WinRateSummaryProps) {
  const [data, setData] = React.useState<APIResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
   (async () => {
      if (!channelId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ channelId });
        const res = await fetch(`/api/dashboard/winrates?${params.toString()}`);
        const json = (await res.json()) as APIResponse;
        if (!res.ok) throw new Error(json?.error || 'Failed to fetch');
        setData(json);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [channelId]);

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Win rate vs comparable</div>
      {loading ? (
        <div className="h-[160px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
      ) : error ? (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : !data ? (
        <div className="text-sm opacity-60">No data</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GroupTable title="By length band" groups={data.byLengthBand} />
          <GroupTable title="By topic cluster" groups={data.byTopicCluster} />
        </div>
      )}
    </div>
  );
}


