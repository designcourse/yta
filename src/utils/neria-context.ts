import { createSupabaseServerClient } from '@/utils/supabase/server';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

type ContextBundle = {
  refreshedAt: string;
  kpis?: {
    videoId: string | null;
    comparable: { count: number; dims: { format?: string | null; lengthBand?: string | null; topicCluster?: string | null }; confidence: string };
    baselinesSummary: Record<string, { median?: number | null; iqr?: number | null }>;
    current: Record<string, number | null>;
    verdicts: Record<string, 'pass' | 'neutral' | 'fail' | null>;
    goals?: { growth: number; monetization: number; community: number; shorts: number } | null;
  };
  retention?: {
    hookExcerpt?: string;
    tips?: Array<{ time: number; pct: number; suggestion: string }>;
  };
  experiment?: {
    lever: string;
    hypothesis: string;
    stepsCount: number;
    outcome?: 'win' | 'neutral' | 'loss' | 'pending';
  } | null;
  competitors?: {
    sampleSize: number;
    avgVpdAcross?: number;
    channels?: string[];
    topVideoTitles?: string[];
    topicOpportunities: Array<{ keyword: string; avgVpd: number; count: number }>;
    priorBased: true;
  };
};

function medianAndIqr(q: any): { median?: number | null; iqr?: number | null } {
  if (!q) return {};
  const q1 = Number(q.q1 ?? q.Q1 ?? q.p25 ?? q.P25);
  const q2 = Number(q.q2 ?? q.Q2 ?? q.median ?? q.Median);
  const q3 = Number(q.q3 ?? q.Q3 ?? q.p75 ?? q.P75);
  const valid = (n: any) => Number.isFinite(Number(n));
  const iqr = valid(q1) && valid(q3) ? Number(q3) - Number(q1) : undefined;
  return { median: valid(q2) ? Number(q2) : undefined, iqr: valid(iqr) ? Number(iqr) : undefined };
}

function trim(text?: string, max = 220): string | undefined {
  if (!text) return undefined;
  const t = String(text).trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

async function readCachedBundle(supabase: any, internalChannelId: string): Promise<ContextBundle | null> {
  try {
    const { data } = await supabase
      .from('neria_context')
      .select('prompt_text')
      .eq('channel_id', internalChannelId)
      .eq('prompt_type', 'context_bundle')
      .maybeSingle();
    if (!data?.prompt_text) return null;
    const parsed: ContextBundle = JSON.parse(data.prompt_text);
    const ttlMs = 45 * 60 * 1000; // 45 minutes
    const ts = parsed?.refreshedAt ? new Date(parsed.refreshedAt).getTime() : 0;
    if (ts && Date.now() - ts < ttlMs) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function writeCachedBundle(supabase: any, internalChannelId: string, bundle: ContextBundle) {
  try {
    await supabase
      .from('neria_context')
      .upsert({
        channel_id: internalChannelId,
        prompt_type: 'context_bundle',
        prompt_text: JSON.stringify(bundle),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'channel_id,prompt_type' });
  } catch {}
}

export async function buildNeriaContextBundle(opts: {
  request: Request;
  channelExternalId: string; // YouTube channel id
  internalChannelId: string; // channels.id UUID
}): Promise<ContextBundle> {
  const { request, channelExternalId, internalChannelId } = opts;
  const supabase = await createSupabaseServerClient();

  // Try cached bundle first
  const cached = await readCachedBundle(supabase, internalChannelId);
  if (cached) return cached;

  const origin = new URL(request.url).origin;
  const cookie = request.headers.get('cookie') || '';
  const fetcher: Fetcher = (url, init) => fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), cookie },
  });

  const bundle: ContextBundle = { refreshedAt: new Date().toISOString() };

  // KPIs and Goals
  try {
    const kRes = await fetcher(`${origin}/api/dashboard/kpis?channelId=${encodeURIComponent(channelExternalId)}`);
    if (kRes.ok) {
      const k = await kRes.json();
      const baselinesSummary: Record<string, { median?: number | null; iqr?: number | null }> = {};
      if (k?.baselines) {
        for (const key of Object.keys(k.baselines)) {
          baselinesSummary[key] = medianAndIqr(k.baselines[key]);
        }
      }
      if (k?.comparable && k?.current && k?.verdicts) {
        bundle.kpis = {
          videoId: k.videoId ?? null,
          comparable: {
            count: Number(k.comparable?.count || 0),
            dims: {
              format: k.comparable?.dims?.format ?? null,
              lengthBand: k.comparable?.dims?.lengthBand ?? null,
              topicCluster: k.comparable?.dims?.topicCluster ?? null,
            },
            confidence: String(k.comparable?.confidence || 'low'),
          },
          baselinesSummary,
          current: k.current || {},
          verdicts: k.verdicts || {},
          goals: k.goals || null,
        };
      }
    }
  } catch {}

  // Retention insights (shortened)
  try {
    const vid = bundle.kpis?.videoId;
    const url = vid
      ? `${origin}/api/latest-video-insights?channelId=${encodeURIComponent(channelExternalId)}&videoId=${encodeURIComponent(vid)}`
      : `${origin}/api/latest-video-insights?channelId=${encodeURIComponent(channelExternalId)}`;
    const iRes = await fetcher(url);
    if (iRes.ok) {
      const i = await iRes.json();
      const tips = Array.isArray(i?.insights)
        ? i.insights.slice(0, 3).map((x: any) => ({ time: Number(x.time || 0), pct: Number(x.pct || 0), suggestion: trim(String(x.suggestion || ''), 140) || '' }))
        : [];
      bundle.retention = {
        hookExcerpt: trim(i?.hookExcerpt, 200),
        tips,
      };
    }
  } catch {}

  // Latest experiment (if any)
  try {
    const eRes = await fetcher(`${origin}/api/experiments?channelId=${encodeURIComponent(channelExternalId)}&videoId=${encodeURIComponent(bundle.kpis?.videoId || '')}`);
    if (eRes.ok) {
      const e = await eRes.json();
      if (e?.latest?.lever) {
        bundle.experiment = {
          lever: String(e.latest.lever || ''),
          hypothesis: trim(String(e.latest.hypothesis || ''), 200) || '',
          stepsCount: Array.isArray(e.latest?.recommendation?.steps) ? e.latest.recommendation.steps.length : 0,
          outcome: e.latest?.outcome_24h || undefined,
        };
      } else {
        bundle.experiment = null;
      }
    }
  } catch {}

  // Competitor priors (cached 3h in API)
  try {
    const cRes = await fetcher(`${origin}/api/competitors/metrics?channelId=${encodeURIComponent(channelExternalId)}`);
    if (cRes.ok) {
      const cj = await cRes.json();
      const all: any[] = Array.isArray(cj?.results) ? cj.results : [];
      const topics: Array<{ keyword: string; avgVpd: number; count: number }> = [];
      let sampleSize = 0;
      let vpdSum = 0;
      let vpdCount = 0;
      const names: string[] = [];
      const titles: string[] = [];
      for (const r of all) {
        const s = Number(r?.metrics?.sampleSize || 0);
        sampleSize += Number.isFinite(s) ? s : 0;
        if (r?.metrics?.avgVpd != null && Number.isFinite(Number(r.metrics.avgVpd))) {
          vpdSum += Number(r.metrics.avgVpd);
          vpdCount += 1;
        }
        if (r?.competitor_title) names.push(String(r.competitor_title));
        // Collect top video titles per competitor (up to 2 each to cap token usage)
        const tv: any[] = Array.isArray(r?.metrics?.topVideos) ? r.metrics.topVideos : [];
        for (const v of tv.slice(0, 2)) {
          const t = String(v?.title || '').trim().replace(/\s+/g, ' ');
          if (t) titles.push(t);
        }
        const th: any[] = Array.isArray(r?.metrics?.topicHitRates) ? r.metrics.topicHitRates : [];
        for (const t of th) {
          if (!t?.keyword) continue;
          topics.push({ keyword: String(t.keyword), avgVpd: Number(t.avgVpd || 0), count: Number(t.count || 0) });
        }
      }
      topics.sort((a, b) => b.avgVpd - a.avgVpd);
      bundle.competitors = {
        sampleSize,
        avgVpdAcross: vpdCount > 0 ? Math.round((vpdSum / vpdCount) * 100) / 100 : undefined,
        channels: names.slice(0, 5),
        topVideoTitles: titles.slice(0, 6),
        topicOpportunities: topics.slice(0, 5),
        priorBased: true,
      };
    }
  } catch {}

  // Persist snapshot for brief reuse
  await writeCachedBundle(supabase, internalChannelId, bundle);
  return bundle;
}

export function formatBundleForSystemPrompt(bundle: ContextBundle): string {
  const lines: string[] = [];
  lines.push('CONTEXT BUNDLE (facts only)');
  lines.push(`Refreshed: ${bundle.refreshedAt}`);
  if (bundle.kpis) {
    const k = bundle.kpis;
    const dims = k.comparable?.dims || {};
    lines.push(`Comparable Set: count=${k.comparable.count}, format=${dims.format || 'n/a'}, lengthBand=${dims.lengthBand || 'n/a'}, topic=${dims.topicCluster || 'n/a'}, confidence=${k.comparable.confidence}`);
    const bsum = k.baselinesSummary || {};
    const fmt = (m?: { median?: number | null; iqr?: number | null }) => {
      const med = (m && m.median != null) ? Number(m.median).toFixed(2) : 'n/a';
      const iqr = (m && m.iqr != null) ? Number(m.iqr).toFixed(2) : 'n/a';
      return `median=${med}, iqr=${iqr}`;
    };
    lines.push(`Baselines: ctr_24h(${fmt(bsum.ctr_24h)}), avd_24h(${fmt(bsum.avd_24h)}), vpd_24h(${fmt(bsum.vpd_24h)}), retention_pct(${fmt(bsum.retention_pct)})`);
    const cur = k.current || {};
    const v = k.verdicts || {};
    const sv = (n: any) => (n == null ? 'n/a' : String(n));
    lines.push(`Current: CTR=${sv(cur.ctr_24h)}, AVD=${sv(cur.avd_24h)}s, VPD=${sv(cur.vpd_24h)}, Retention%=${sv(cur.retention_pct)}`);
    lines.push(`Verdicts: CTR=${v.ctr_24h || 'n/a'}, AVD=${v.avd_24h || 'n/a'}, VPD=${v.vpd_24h || 'n/a'}, Retention=${v.retention_pct || 'n/a'}`);
    if (k.goals) {
      const g = k.goals;
      lines.push(`Goals Weights: growth=${g.growth}, monetization=${g.monetization}, community=${g.community}, shorts=${g.shorts}`);
    }
  }
  if (bundle.retention && (bundle.retention.hookExcerpt || (bundle.retention.tips && bundle.retention.tips.length))) {
    if (bundle.retention.hookExcerpt) lines.push(`Hook Excerpt: ${bundle.retention.hookExcerpt}`);
    const tipStr = (bundle.retention.tips || []).map(t => `@${t.time}s (${t.pct}%): ${t.suggestion}`).join(' | ');
    if (tipStr) lines.push(`Retention Tips: ${tipStr}`);
  }
  if (bundle.experiment) {
    const e = bundle.experiment;
    lines.push(`Next Experiment: lever=${e.lever}, steps=${e.stepsCount}${e.outcome ? `, outcome_24h=${e.outcome}` : ''}`);
    if (e.hypothesis) lines.push(`Hypothesis: ${e.hypothesis}`);
  }
  if (bundle.competitors && Array.isArray(bundle.competitors.topicOpportunities) && bundle.competitors.topicOpportunities.length) {
    const topics = bundle.competitors.topicOpportunities.slice(0, 3).map(t => `${t.keyword} (avgVPD ${t.avgVpd.toFixed(1)}, n=${t.count})`).join('; ');
    const avg = bundle.competitors.avgVpdAcross != null ? `, avgVPD≈${bundle.competitors.avgVpdAcross}` : '';
    const chans = Array.isArray(bundle.competitors.channels) && bundle.competitors.channels.length ? `, channels: ${bundle.competitors.channels.slice(0, 3).join(', ')}` : '';
    lines.push(`Competitor Analysis (sample=${bundle.competitors.sampleSize}${avg}${chans}): ${topics}`);
    if (Array.isArray(bundle.competitors.topVideoTitles) && bundle.competitors.topVideoTitles.length) {
      const titleList = bundle.competitors.topVideoTitles.slice(0, 6).map(t => (t.length > 80 ? `${t.slice(0, 77)}…` : t)).join(' | ');
      lines.push(`Competitor Video Titles (recent top performers from similar channels): ${titleList}`);
    }
  }
  return lines.join('\n');
}


