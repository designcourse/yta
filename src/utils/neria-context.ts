import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

type ContextBundle = {
  refreshedAt: string;
  nextVideo?: {
    status: 'none' | 'set';
    title?: string;
    planId?: string;
    hasThumbnail?: boolean;
    hasOutline?: boolean;
  };
  script?: {
    videoTitle?: string;
    durationMinutes?: number;
    sections: Array<{
      position: number;
      startTime: number;
      title: string;
      summary: string;
    }>;
  };
  prepublishAnalysis?: {
    videoId?: string;
    planId?: string;
    analyzedAt: string;
    scores?: {
      hook?: number;
      pacing?: number;
      energy?: number;
      visual?: number;
    };
    pacing_metrics?: {
      avg_scene_duration?: number;
      scene_count?: number;
      transitions_per_minute?: number;
    };
    flatSpots?: Array<{ start: number; end?: number; reason?: string }>;
    moments?: Array<{ time: number; caption?: string; title?: string }>;
    summary?: string;
    transcriptExcerpt?: string;
  };
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
  contentBuckets?: {
    totalBuckets: number;
    totalVideos: number;
    buckets: Array<{
      key: string;
      label: string;
      description: string;
      videoCount: number;
      totalViews: number;
      medianViews: number;
      successScore: number;
      topVideo: { videoId: string; views: number } | null;
      recentVideos: number;
    }>;
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
  const ttlMs = 45 * 60 * 1000; // 45 minutes
  const tryParse = (raw?: string | null) => {
    if (!raw) return null;
    try {
      const parsed: ContextBundle = JSON.parse(raw);
      const ts = parsed?.refreshedAt ? new Date(parsed.refreshedAt).getTime() : 0;
      if (ts && Date.now() - ts < ttlMs) return parsed;
      return null;
    } catch {
      return null;
    }
  };
  try {
    const { data } = await supabase
      .from('neria_context')
      .select('prompt_text')
      .eq('channel_id', internalChannelId)
      .eq('prompt_type', 'context_bundle')
      .maybeSingle();
    const parsed = tryParse(data?.prompt_text);
    if (parsed) return parsed;
  } catch {}
  // Fallback to admin client read (in case RLS blocks user read)
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from('neria_context')
      .select('prompt_text')
      .eq('channel_id', internalChannelId)
      .eq('prompt_type', 'context_bundle')
      .maybeSingle();
    const parsed = tryParse(data?.prompt_text);
    if (parsed) return parsed;
  } catch {}
  return null;
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
  } catch {
    // Fallback to admin client in case of RLS issues
    try {
      const admin = createSupabaseAdminClient();
      await admin
        .from('neria_context')
        .upsert({
          channel_id: internalChannelId,
          prompt_type: 'context_bundle',
          prompt_text: JSON.stringify(bundle),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'channel_id,prompt_type' });
    } catch {}
  }
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

  // In-memory cache as a second layer (per-process) to avoid redundant refetch
  // Note: this is per server instance; still provides protection during bursts.
  const g: any = globalThis as any;
  g.__neriaContextCache ||= new Map<string, { ts: number; bundle: ContextBundle }>();
  const key = `bundle:${internalChannelId}`;
  const hit = g.__neriaContextCache.get(key);
  if (hit && Date.now() - hit.ts < 45 * 60 * 1000) {
    return hit.bundle;
  }

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

  // Prepublish analysis for latest video (by videoId)
  try {
    const vid = bundle.kpis?.videoId;
    console.log('[Neria][Context] Checking prepublish analysis for videoId:', vid);
    if (vid) {
      const ppRes = await fetcher(`${origin}/api/videos/prepublish?videoId=${encodeURIComponent(vid)}`);
      console.log('[Neria][Context] Prepublish API response status:', ppRes.status);
      if (ppRes.ok) {
        const ppData = await ppRes.json();
        console.log('[Neria][Context] Prepublish data:', { 
          hasVideo: !!ppData?.video, 
          status: ppData?.video?.status,
          hasAnalysis: !!ppData?.analysis,
          hasAnalysisJson: !!ppData?.analysis?.analysis_json 
        });
        if (ppData?.video?.status === 'ready' && ppData?.analysis?.analysis_json) {
          const aj: any = ppData.analysis.analysis_json;
          const transcript: any = ppData.analysis.transcript_json;
          
          // Extract transcript excerpt (first 500 chars)
          let transcriptExcerpt: string | undefined;
          if (transcript?.entries && Array.isArray(transcript.entries)) {
            const fullText = transcript.entries
              .map((e: any) => String(e.text || ''))
              .join(' ')
              .trim();
            transcriptExcerpt = fullText.length > 500 ? fullText.slice(0, 497) + '...' : fullText;
          }

          bundle.prepublishAnalysis = {
            videoId: vid,
            planId: ppData.video.plan_id || undefined,
            analyzedAt: ppData.analysis.created_at || new Date().toISOString(),
            scores: {
              hook: aj?.scores?.hook_strength ?? aj?.scores?.hook_score ?? aj?.scores?.hook,
              pacing: aj?.scores?.pacing_score ?? aj?.scores?.pacing,
              energy: aj?.scores?.energy_level ?? aj?.scores?.energy,
              visual: aj?.scores?.visual_engagement ?? aj?.scores?.visual,
            },
            pacing_metrics: {
              avg_scene_duration: aj?.pacing_metrics?.avg_scene_duration,
              scene_count: aj?.pacing_metrics?.scene_count,
              transitions_per_minute: aj?.pacing_metrics?.transitions_per_minute,
            },
            flatSpots: Array.isArray(aj?.flat_spots)
              ? aj.flat_spots.map((fs: any) => ({
                  start: Number(fs.start || 0),
                  end: fs.end != null ? Number(fs.end) : undefined,
                  reason: trim(String(fs.reason || fs.description || ''), 150),
                }))
              : [],
            moments: Array.isArray(aj?.moments)
              ? aj.moments.map((m: any) => ({
                  time: Number(m.time || m.timestamp || 0),
                  caption: trim(String(m.caption || m.description || ''), 150),
                  title: trim(String(m.title || ''), 80),
                }))
              : [],
            summary: trim(ppData.analysis.summary || aj?.summary, 400),
            transcriptExcerpt,
          };
          console.log('[Neria][Context] Prepublish analysis added to bundle for videoId:', vid);
        }
      }
    } else {
      console.log('[Neria][Context] No videoId found in KPIs, skipping prepublish analysis fetch');
    }
  } catch (err) {
    console.error('[Neria][Context] Error fetching prepublish analysis:', err);
  }

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

  // Next video status + thumbnail/outline completion + script content + prepublish analysis
  try {
    // Fetch plans to identify which one is marked as next
    const pRes = await fetcher(`${origin}/api/video-plans?channelId=${encodeURIComponent(channelExternalId)}`);
    if (pRes.ok) {
      const pj = await pRes.json();
      const plans: Array<any> = Array.isArray(pj?.plans) ? pj.plans : [];
      const next = plans.find((p: any) => p?.is_next);
      if (!next) {
        bundle.nextVideo = { status: 'none' };
      } else {
        // Outline status: check scripts API for this plan
        let hasOutline = false;
        let scriptData: any = null;
        try {
          const sRes = await fetcher(`${origin}/api/scripts?planId=${encodeURIComponent(next.id)}`);
          if (sRes.ok) {
            const sj = await sRes.json();
            hasOutline = !!(sj?.script && Array.isArray(sj?.script?.sections) && sj.script.sections.length > 0);
            scriptData = sj?.script;
          }
        } catch {}

        bundle.nextVideo = {
          status: 'set',
          title: String(next.title || ''),
          planId: String(next.id || ''),
          hasThumbnail: !!next.thumbnail_url,
          hasOutline,
        };

        // Include script content if available
        if (scriptData && Array.isArray(scriptData.sections) && scriptData.sections.length > 0) {
          bundle.script = {
            videoTitle: String(next.title || ''),
            durationMinutes: scriptData.duration_seconds ? Math.round(Number(scriptData.duration_seconds) / 60) : undefined,
            sections: scriptData.sections.map((section: any) => ({
              position: Number(section.position || 0),
              startTime: Number(section.start_time_seconds || 0),
              title: trim(String(section.title || ''), 100) || '',
              summary: trim(String(section.summary || ''), 300) || '',
            })),
          };
        }

        // Fetch prepublish analysis if available (only if not already set from latest video)
        if (!bundle.prepublishAnalysis) {
          try {
            const ppRes = await fetcher(`${origin}/api/videos/prepublish?planId=${encodeURIComponent(next.id)}`);
            if (ppRes.ok) {
              const ppData = await ppRes.json();
              if (ppData?.video?.status === 'ready' && ppData?.analysis?.analysis_json) {
              const aj: any = ppData.analysis.analysis_json;
              const transcript: any = ppData.analysis.transcript_json;
              
              // Extract transcript excerpt (first 500 chars)
              let transcriptExcerpt: string | undefined;
              if (transcript?.entries && Array.isArray(transcript.entries)) {
                const fullText = transcript.entries
                  .map((e: any) => String(e.text || ''))
                  .join(' ')
                  .trim();
                transcriptExcerpt = fullText.length > 500 ? fullText.slice(0, 497) + '...' : fullText;
              }

              bundle.prepublishAnalysis = {
                videoId: ppData.video.video_id || undefined,
                planId: String(next.id),
                analyzedAt: ppData.analysis.created_at || new Date().toISOString(),
                scores: {
                  hook: aj?.scores?.hook_strength ?? aj?.scores?.hook_score ?? aj?.scores?.hook,
                  pacing: aj?.scores?.pacing_score ?? aj?.scores?.pacing,
                  energy: aj?.scores?.energy_level ?? aj?.scores?.energy,
                  visual: aj?.scores?.visual_engagement ?? aj?.scores?.visual,
                },
                pacing_metrics: {
                  avg_scene_duration: aj?.pacing_metrics?.avg_scene_duration,
                  scene_count: aj?.pacing_metrics?.scene_count,
                  transitions_per_minute: aj?.pacing_metrics?.transitions_per_minute,
                },
                flatSpots: Array.isArray(aj?.flat_spots)
                  ? aj.flat_spots.map((fs: any) => ({
                      start: Number(fs.start || 0),
                      end: fs.end != null ? Number(fs.end) : undefined,
                      reason: trim(String(fs.reason || fs.description || ''), 150),
                    }))
                  : [],
                moments: Array.isArray(aj?.moments)
                  ? aj.moments.map((m: any) => ({
                      time: Number(m.time || m.timestamp || 0),
                      caption: trim(String(m.caption || m.description || ''), 150),
                      title: trim(String(m.title || ''), 80),
                    }))
                  : [],
                summary: trim(ppData.analysis.summary || aj?.summary, 400),
                transcriptExcerpt,
              };
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  // Content Buckets Analytics
  try {
    console.log('[Neria][Context] Fetching content buckets for channel:', channelExternalId);
    const bucketsRes = await fetcher(`${origin}/api/buckets/analytics?channelId=${encodeURIComponent(channelExternalId)}`);
    console.log('[Neria][Context] Buckets API response status:', bucketsRes.status);
    if (bucketsRes.ok) {
      const bucketsData = await bucketsRes.json();
      console.log('[Neria][Context] Buckets data:', JSON.stringify(bucketsData, null, 2));
      if (bucketsData?.buckets && Array.isArray(bucketsData.buckets) && bucketsData.buckets.length > 0) {
        bundle.contentBuckets = {
          totalBuckets: bucketsData.totalBuckets || bucketsData.buckets.length,
          totalVideos: bucketsData.totalVideos || 0,
          buckets: bucketsData.buckets.map((bucket: any) => ({
            key: String(bucket.key || ''),
            label: String(bucket.label || ''),
            description: String(bucket.description || ''),
            videoCount: Number(bucket.videoCount || 0),
            totalViews: Number(bucket.totalViews || 0),
            medianViews: Number(bucket.medianViews || 0),
            successScore: Number(bucket.successScore || 0),
            topVideo: bucket.topVideo ? {
              videoId: String(bucket.topVideo.videoId || ''),
              views: Number(bucket.topVideo.views || 0)
            } : null,
            recentVideos: Number(bucket.recentVideos || 0),
          })),
        };
        console.log('[Neria][Context] Content buckets added to bundle:', bundle.contentBuckets.totalBuckets, 'buckets');
      } else {
        console.log('[Neria][Context] No content buckets found or empty array');
      }
    } else {
      console.log('[Neria][Context] Buckets API request failed:', bucketsRes.status, bucketsRes.statusText);
    }
  } catch (error) {
    console.log('[Neria][Context] Error fetching content buckets:', error);
  }

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
  try {
    const g2: any = globalThis as any;
    g2.__neriaContextCache ||= new Map();
    g2.__neriaContextCache.set(key, { ts: Date.now(), bundle });
  } catch {}
  return bundle;
}

export async function formatBundleForSystemPrompt(bundle: ContextBundle): Promise<string> {
  const lines: string[] = [];
  lines.push('CONTEXT BUNDLE (facts only)');
  lines.push(`Refreshed: ${bundle.refreshedAt}`);
  // Next video guidance line
  if (bundle.nextVideo) {
    if (bundle.nextVideo.status === 'none') {
      lines.push('NEXT VIDEO: The user has not specified their next video.');
    } else {
      const nv = bundle.nextVideo;
      const steps: string[] = [];
      steps.push(nv.hasThumbnail ? 'thumbnail=done' : 'thumbnail=pending');
      steps.push(nv.hasOutline ? 'outline=done' : 'outline=pending');
      lines.push(`NEXT VIDEO: ${nv.title || '(untitled)'} [${steps.join(', ')}]`);
    }
  }
  
  // Prepublish analysis section (comprehensive data)
  if (bundle.prepublishAnalysis) {
    const pa = bundle.prepublishAnalysis;
    lines.push('');
    lines.push('PREPUBLISH VIDEO ANALYSIS (Gemini review of rough cut):');
    
    // Scores
    if (pa.scores && Object.keys(pa.scores).length > 0) {
      const scoreParts: string[] = [];
      if (pa.scores.hook != null) scoreParts.push(`hook=${Number(pa.scores.hook).toFixed(1)}/10`);
      if (pa.scores.pacing != null) scoreParts.push(`pacing=${Number(pa.scores.pacing).toFixed(1)}/10`);
      if (pa.scores.energy != null) scoreParts.push(`energy=${Number(pa.scores.energy).toFixed(1)}/10`);
      if (pa.scores.visual != null) scoreParts.push(`visual=${Number(pa.scores.visual).toFixed(1)}/10`);
      if (scoreParts.length) lines.push(`Scores: ${scoreParts.join(', ')}`);
    }
    
    // Pacing metrics
    if (pa.pacing_metrics) {
      const pm = pa.pacing_metrics;
      const pmParts: string[] = [];
      if (pm.avg_scene_duration != null) pmParts.push(`avg scene ${Number(pm.avg_scene_duration).toFixed(1)}s`);
      if (pm.scene_count != null) pmParts.push(`${pm.scene_count} scenes`);
      if (pm.transitions_per_minute != null) pmParts.push(`${Number(pm.transitions_per_minute).toFixed(1)} transitions/min`);
      if (pmParts.length) lines.push(`Pacing: ${pmParts.join(', ')}`);
    }
    
    // Flat spots (problem areas)
    if (pa.flatSpots && pa.flatSpots.length > 0) {
      lines.push(`Flat Spots (${pa.flatSpots.length} identified):`);
      pa.flatSpots.slice(0, 5).forEach((fs, idx) => {
        const timeRange = fs.end != null ? `${Math.round(fs.start)}s-${Math.round(fs.end)}s` : `@${Math.round(fs.start)}s`;
        const reason = fs.reason ? `: ${fs.reason}` : '';
        lines.push(`  ${idx + 1}. ${timeRange}${reason}`);
      });
      if (pa.flatSpots.length > 5) {
        lines.push(`  ... and ${pa.flatSpots.length - 5} more`);
      }
    }
    
    // Highlight moments (strong points)
    if (pa.moments && pa.moments.length > 0) {
      lines.push(`Strong Moments (${pa.moments.length} identified):`);
      pa.moments.slice(0, 5).forEach((m, idx) => {
        const desc = m.caption || m.title || 'Engaging moment';
        lines.push(`  ${idx + 1}. @${Math.round(m.time)}s: ${desc}`);
      });
      if (pa.moments.length > 5) {
        lines.push(`  ... and ${pa.moments.length - 5} more`);
      }
    }
    
    // Summary
    if (pa.summary) {
      lines.push(`Summary: ${pa.summary}`);
    }
    
    // Transcript excerpt
    if (pa.transcriptExcerpt) {
      lines.push(`Transcript Excerpt: "${pa.transcriptExcerpt}"`);
    }
    
    lines.push('');
  }
  // Script content (if available)
  if (bundle.script && Array.isArray(bundle.script.sections) && bundle.script.sections.length > 0) {
    lines.push(`SCRIPT OUTLINE: "${bundle.script.videoTitle || 'Untitled'}" (${bundle.script.durationMinutes || 'unknown'} min, ${bundle.script.sections.length} sections)`);
    bundle.script.sections.forEach((section, index) => {
      const timeStr = section.startTime > 0 ? `${Math.floor(section.startTime / 60)}:${(section.startTime % 60).toString().padStart(2, '0')}` : '0:00';
      lines.push(`  ${index + 1}. [${timeStr}] ${section.title}`);
      if (section.summary) {
        lines.push(`     ${section.summary}`);
      }
    });
  }
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
  if (bundle.contentBuckets && Array.isArray(bundle.contentBuckets.buckets) && bundle.contentBuckets.buckets.length > 0) {
    lines.push(`Content Buckets: ${bundle.contentBuckets.totalBuckets} buckets organizing ${bundle.contentBuckets.totalVideos} videos`);
    const bucketSummaries = bundle.contentBuckets.buckets.slice(0, 5).map(bucket => {
      const topVideoInfo = bucket.topVideo ? ` (best: ${bucket.topVideo.views.toLocaleString()} views)` : '';
      const recentInfo = bucket.recentVideos > 0 ? `, ${bucket.recentVideos} recent` : '';
      return `"${bucket.label}" (${bucket.videoCount} videos, ${bucket.medianViews.toLocaleString()} median views${recentInfo}${topVideoInfo}, score: ${bucket.successScore})`;
    }).join('; ');
    lines.push(`Bucket Details: ${bucketSummaries}`);
    lines.push('Note: You can draw from these content buckets when suggesting video ideas or analyzing channel strategy. Each bucket represents a proven content category with performance metrics.');
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
  
  // Add guardrails section
  lines.push('');
  lines.push('GUARDRAILS:');
  lines.push('- Use only the numbers provided above; do not invent metrics.');
  lines.push('- Do not speculate on competitor private metrics (CTR, retention, impressions).');
  lines.push('- Keep recommendations grounded in provided KPIs, verdicts, insights, and goals.');
  lines.push('- When users ask about "competitor titles" or "similar to competitors", reference the Competitor Video Titles listed above.');
  lines.push('- You can use competitor video titles as inspiration for generating similar content ideas.');
  if (bundle.contentBuckets && bundle.contentBuckets.buckets.length > 0) {
    lines.push('- When suggesting video ideas, consider drawing from the established Content Buckets which have proven performance metrics.');
    lines.push('- Reference specific bucket performance data (median views, success scores) when recommending content strategies.');
  }
  if (bundle.script && Array.isArray(bundle.script.sections) && bundle.script.sections.length > 0) {
    lines.push('- When users ask about their script or next video, reference the SCRIPT OUTLINE provided above with specific section titles and summaries.');
    lines.push('- Provide feedback on script structure, pacing, section content, and timing based on the outlined sections.');
  }
  if (bundle.prepublishAnalysis) {
    lines.push('- When discussing the next video, reference the PREPUBLISH VIDEO ANALYSIS data including scores, flat spots, and strong moments.');
    lines.push('- Use prepublish analysis to provide pre-launch coaching: suggest edits to fix flat spots, enhance strong moments, improve pacing.');
    lines.push('- Compare prepublish scores to expected performance based on comparable baselines when advising on readiness to publish.');
  }
  
  return lines.join('\n');
}

export async function invalidateNeriaContextCache(internalChannelId: string) {
  // Remove DB snapshot for this channel
  try {
    const admin = createSupabaseAdminClient();
    await admin
      .from('neria_context')
      .delete()
      .eq('channel_id', internalChannelId)
      .eq('prompt_type', 'context_bundle');
  } catch {}
  // Clear in-memory cache
  try {
    const g: any = globalThis as any;
    if (g.__neriaContextCache instanceof Map) {
      g.__neriaContextCache.delete(`bundle:${internalChannelId}`);
    }
  } catch {}
}

export async function patchNeriaContextNextVideo(internalChannelId: string, next: { title: string; planId: string; hasThumbnail: boolean; hasOutline: boolean }) {
  try {
    const supabase = await createSupabaseServerClient();
    // Try to read existing bundle (DB or memory)
    let bundle = await readCachedBundle(supabase, internalChannelId);
    if (!bundle) {
      // Fallback to memory cache
      try {
        const g: any = globalThis as any;
        if (g.__neriaContextCache instanceof Map) {
          const hit = g.__neriaContextCache.get(`bundle:${internalChannelId}`);
          if (hit && hit.bundle) bundle = hit.bundle as ContextBundle;
        }
      } catch {}
    }
    const base: ContextBundle = bundle || { refreshedAt: new Date().toISOString() };
    base.nextVideo = {
      status: 'set',
      title: next.title,
      planId: next.planId,
      hasThumbnail: !!next.hasThumbnail,
      hasOutline: !!next.hasOutline,
    };
    
    // If outline is available, fetch and include script content
    if (next.hasOutline) {
      try {
        const { data: scriptData } = await supabase
          .from("scripts")
          .select(`
            id, duration_seconds,
            script_sections!inner(position, start_time_seconds, title, summary)
          `)
          .eq("video_plan_id", next.planId)
          .eq("status", "ready")
          .maybeSingle();
        
        if (scriptData && Array.isArray(scriptData.script_sections) && scriptData.script_sections.length > 0) {
          base.script = {
            videoTitle: next.title,
            durationMinutes: scriptData.duration_seconds ? Math.round(Number(scriptData.duration_seconds) / 60) : undefined,
            sections: scriptData.script_sections
              .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
              .map((section: any) => ({
                position: Number(section.position || 0),
                startTime: Number(section.start_time_seconds || 0),
                title: trim(String(section.title || ''), 100) || '',
                summary: trim(String(section.summary || ''), 300) || '',
              })),
          };
        } else {
          // Clear script if no valid sections found
          delete base.script;
        }
      } catch {
        // If script fetch fails, clear script data
        delete base.script;
      }
    } else {
      // Clear script if outline not available
      delete base.script;
    }
    
    // Fetch prepublish analysis if available
    try {
      const admin = createSupabaseAdminClient();
      const { data: vids } = await admin
        .from('prepublish_videos')
        .select('id, video_id, status')
        .eq('plan_id', next.planId)
        .order('uploaded_at', { ascending: false })
        .limit(1);
      
      if (vids?.[0]?.status === 'ready') {
        const vidId = vids[0].id;
        const { data: analysis } = await admin
          .from('prepublish_analyses')
          .select('analysis_json, transcript_json, summary, created_at')
          .eq('prepublish_video_id', vidId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (analysis?.analysis_json) {
          const aj: any = analysis.analysis_json;
          const transcript: any = analysis.transcript_json;
          
          // Extract transcript excerpt (first 500 chars)
          let transcriptExcerpt: string | undefined;
          if (transcript?.entries && Array.isArray(transcript.entries)) {
            const fullText = transcript.entries
              .map((e: any) => String(e.text || ''))
              .join(' ')
              .trim();
            transcriptExcerpt = fullText.length > 500 ? fullText.slice(0, 497) + '...' : fullText;
          }

          base.prepublishAnalysis = {
            videoId: vids[0].video_id || undefined,
            planId: next.planId,
            analyzedAt: analysis.created_at || new Date().toISOString(),
            scores: {
              hook: aj?.scores?.hook_strength ?? aj?.scores?.hook_score ?? aj?.scores?.hook,
              pacing: aj?.scores?.pacing_score ?? aj?.scores?.pacing,
              energy: aj?.scores?.energy_level ?? aj?.scores?.energy,
              visual: aj?.scores?.visual_engagement ?? aj?.scores?.visual,
            },
            pacing_metrics: {
              avg_scene_duration: aj?.pacing_metrics?.avg_scene_duration,
              scene_count: aj?.pacing_metrics?.scene_count,
              transitions_per_minute: aj?.pacing_metrics?.transitions_per_minute,
            },
            flatSpots: Array.isArray(aj?.flat_spots)
              ? aj.flat_spots.map((fs: any) => ({
                  start: Number(fs.start || 0),
                  end: fs.end != null ? Number(fs.end) : undefined,
                  reason: trim(String(fs.reason || fs.description || ''), 150),
                }))
              : [],
            moments: Array.isArray(aj?.moments)
              ? aj.moments.map((m: any) => ({
                  time: Number(m.time || m.timestamp || 0),
                  caption: trim(String(m.caption || m.description || ''), 150),
                  title: trim(String(m.title || ''), 80),
                }))
              : [],
            summary: trim(analysis.summary || aj?.summary, 400),
            transcriptExcerpt,
          };
        } else {
          delete base.prepublishAnalysis;
        }
      } else {
        delete base.prepublishAnalysis;
      }
    } catch {
      delete base.prepublishAnalysis;
    }
    
    base.refreshedAt = base.refreshedAt || new Date().toISOString();
    // Write back to DB + memory
    await writeCachedBundle(supabase, internalChannelId, base);
    try {
      const g: any = globalThis as any;
      g.__neriaContextCache ||= new Map();
      g.__neriaContextCache.set(`bundle:${internalChannelId}`, { ts: Date.now(), bundle: base });
    } catch {}
  } catch {}
}

export async function getCachedContextBundle(internalChannelId: string): Promise<ContextBundle | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const cached = await readCachedBundle(supabase, internalChannelId);
    if (cached) return cached;
  } catch {}
  try {
    const g: any = globalThis as any;
    if (g.__neriaContextCache instanceof Map) {
      const hit = g.__neriaContextCache.get(`bundle:${internalChannelId}`);
      if (hit && hit.bundle) return hit.bundle as ContextBundle;
    }
  } catch {}
  return null;
}

export async function invalidateNeriaContextForScript(internalChannelId: string) {
  // Invalidate context cache when scripts are created/updated
  // This ensures Neria gets fresh script content in conversations
  await invalidateNeriaContextCache(internalChannelId);
}



