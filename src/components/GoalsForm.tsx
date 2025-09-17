"use client";

import { useEffect, useMemo, useState } from 'react';

export default function GoalsForm({ channelId }: { channelId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState({ growth: 0.4, monetization: 0.3, community: 0.2, shorts: 0.1 });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/goals?channelId=${encodeURIComponent(channelId)}`);
        if (res.ok) {
          const j = await res.json();
          const g = j?.goals || null;
          if (g && active) {
            const next = {
              growth: Number(g.weight_growth ?? 0.4),
              monetization: Number(g.weight_monetization ?? 0.3),
              community: Number(g.weight_community ?? 0.2),
              shorts: Number(g.weight_shorts ?? 0.1),
            };
            setWeights(next);
          }
        }
      } catch (e) {
        setError('Failed to load current goals');
      } finally {
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [channelId]);

  const total = useMemo(() => {
    const t = weights.growth + weights.monetization + weights.community + weights.shorts;
    return Math.round(t * 1000) / 1000;
  }, [weights]);

  const handleChange = (key: keyof typeof weights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : prev[key] }));
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, weights })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to save');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-sm text-gray-700">Distribute emphasis across goals. Total should be ~1.000.</div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-700">Growth</label>
          <input type="number" step="0.05" min="0" max="1" value={weights.growth}
            onChange={(e) => handleChange('growth', parseFloat(e.target.value))}
            className="mt-1 w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Monetization</label>
          <input type="number" step="0.05" min="0" max="1" value={weights.monetization}
            onChange={(e) => handleChange('monetization', parseFloat(e.target.value))}
            className="mt-1 w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Community</label>
          <input type="number" step="0.05" min="0" max="1" value={weights.community}
            onChange={(e) => handleChange('community', parseFloat(e.target.value))}
            className="mt-1 w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Shorts</label>
          <input type="number" step="0.05" min="0" max="1" value={weights.shorts}
            onChange={(e) => handleChange('shorts', parseFloat(e.target.value))}
            className="mt-1 w-full border rounded px-3 py-2" />
        </div>
      </div>
      <div className="text-sm text-gray-600">Total: <span className={total < 0.95 || total > 1.05 ? 'text-amber-600' : 'text-green-700'}>{total.toFixed(3)}</span></div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60">
          {saving ? 'Saving…' : 'Save Goals'}
        </button>
        {loading && <span className="text-sm text-gray-500">Loading…</span>}
      </div>
      <div className="text-xs text-gray-500">Weights influence KPI pass/fail thresholds and experiment priority.</div>
    </div>
  );
}


