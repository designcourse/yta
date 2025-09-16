"use client";

import { useEffect, useMemo, useState } from 'react';

type Summary = Record<string, { win: number; total: number }>

export default function ExperimentsBacklog({ channelId }: { channelId: string }) {
  const [experiments, setExperiments] = useState<Array<any>>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [leverFilter, setLeverFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/experiments?channelId=${encodeURIComponent(channelId)}`);
      if (!res.ok) return;
      const j = await res.json();
      setExperiments(Array.isArray(j.experiments) ? j.experiments : []);
      setSummary(j.summary || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const filtered = useMemo(() => {
    if (leverFilter === 'all') return experiments;
    return experiments.filter((e) => e.lever === leverFilter);
  }, [experiments, leverFilter]);

  const leverOptions = ['all', 'ctr', 'retention', 'topic', 'format'];

  return (
    <div className="mt-6 border dark:border-white/10 rounded-lg p-6 bg-white dark:bg-[#1f2430]">
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-medium">Hypothesis Backlog</div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-md dark:border-white/10 bg-white dark:bg-transparent px-2 py-1 text-sm"
            value={leverFilter}
            onChange={(e) => setLeverFilter(e.target.value)}
          >
            {leverOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <button
            className="text-sm px-2 py-1 border rounded-md dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10"
            onClick={load}
            disabled={loading}
          >{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b dark:border-white/10">
              <th className="py-2 pr-4 text-xs uppercase tracking-wide opacity-60">Video</th>
              <th className="py-2 pr-4 text-xs uppercase tracking-wide opacity-60">Lever</th>
              <th className="py-2 pr-4 text-xs uppercase tracking-wide opacity-60">Hypothesis</th>
              <th className="py-2 pr-4 text-xs uppercase tracking-wide opacity-60">Outcome (24h)</th>
              <th className="py-2 pr-4 text-xs uppercase tracking-wide opacity-60">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const outcome = e.outcome_24h || 'pending';
              const badge = outcome === 'win'
                ? 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300'
                : outcome === 'loss'
                ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                : outcome === 'neutral'
                ? 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300';
              return (
                <tr key={e.id} className="border-b dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                  <td className="py-2 pr-4 font-mono text-xs">{e.video_id}</td>
                  <td className="py-2 pr-4 capitalize">{e.lever}</td>
                  <td className="py-2 pr-4">{e.hypothesis}</td>
                  <td className="py-2 pr-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>{outcome}</span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <button
                      className="text-blue-600 dark:text-blue-400 hover:underline mr-3"
                      onClick={async () => {
                        const newHyp = prompt('Update hypothesis', e.hypothesis);
                        if (!newHyp || newHyp === e.hypothesis) return;
                        await fetch('/api/experiments', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: e.id, hypothesis: newHyp })
                        });
                        load();
                      }}
                    >Edit</button>
                    <button
                      className="text-red-600 dark:text-red-400 hover:underline"
                      onClick={async () => {
                        if (!confirm('Delete this experiment?')) return;
                        await fetch(`/api/experiments?id=${encodeURIComponent(e.id)}`, { method: 'DELETE' });
                        load();
                      }}
                    >Delete</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td className="py-6 text-gray-500 dark:text-gray-400" colSpan={5}>No experiments yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(summary).map(([lever, s]) => (
          <div key={lever} className="border dark:border-white/10 rounded-lg p-4">
            <div className="text-xs uppercase opacity-60">{lever}</div>
            <div className="text-lg font-semibold">{s.total > 0 ? Math.round((s.win / s.total) * 100) : 0}% win rate</div>
            <div className="text-xs opacity-70">{s.win} / {s.total} wins</div>
          </div>
        ))}
        {Object.keys(summary).length === 0 && (
          <div className="text-sm opacity-70">No outcomes yet.</div>
        )}
      </div>
    </div>
  );
}


