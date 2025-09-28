import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getClient } from '@/utils/openai';

export type TrendItem = {
  title: string;
  url: string;
  source: 'news' | 'reddit' | 'youtube' | 'x' | 'linkedin' | 'web';
  published_at?: string | null;
  score?: number;
};

type ChannelContext = {
  channelTitle?: string;
  aboutText?: string;
  recentTitles?: string[];
  topicCluster?: string | null;
};

const TRENDS_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export async function loadChannelContextBasic(
  supabase: any,
  userId: string,
  externalChannelId: string
): Promise<{ internalChannelId: string; ctx: ChannelContext } | null> {
  // Resolve internal channel id
  const { data: ch } = await supabase
    .from('channels')
    .select('id, title')
    .eq('channel_id', externalChannelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!ch) return null;

  // Pull about text and recent titles from neria_context if present
  const { data: ctxRows } = await supabase
    .from('neria_context')
    .select('prompt_type, prompt_text')
    .eq('channel_id', ch.id);

  const aboutText = (ctxRows || []).find((r: any) => r.prompt_type === 'channel_about')?.prompt_text || '';
  let recentTitles: string[] = [];
  try {
    const raw = (ctxRows || []).find((r: any) => r.prompt_type === 'recent_video_titles')?.prompt_text;
    if (raw) recentTitles = JSON.parse(raw);
  } catch {}

  // Topic cluster if available via KPIs cached context (optional, best-effort)
  let topicCluster: string | null = null;
  try {
    const { data: bundleRow } = await supabase
      .from('neria_context')
      .select('prompt_text')
      .eq('channel_id', ch.id)
      .eq('prompt_type', 'context_bundle')
      .maybeSingle();
    if (bundleRow?.prompt_text) {
      const bundle = JSON.parse(bundleRow.prompt_text);
      topicCluster = bundle?.kpis?.comparable?.dims?.topicCluster ?? null;
    }
  } catch {}

  return {
    internalChannelId: ch.id as string,
    ctx: {
      channelTitle: ch.title || undefined,
      aboutText,
      recentTitles,
      topicCluster,
    },
  };
}

function buildPerplexityQuery(ctx: ChannelContext): string {
  const parts: string[] = [];
  if (ctx.topicCluster) parts.push(ctx.topicCluster);
  if (ctx.channelTitle) parts.push(ctx.channelTitle);
  if (ctx.aboutText) parts.push(ctx.aboutText);
  // Build a concise query favoring niche+recency
  const base = parts.filter(Boolean).join(' ');
  return `List the top current news and debates from the last 14 days relevant to this YouTube niche: "${base}". Return STRICT JSON array (max 10) with objects: {"title": string, "url": string, "source": one of ["web","youtube","reddit","x","linkedin","news"], "published_at": ISO8601 or null}. Do not add commentary.`;
}

async function fetchPerplexityTrends(ctx: ChannelContext, limit = 10): Promise<TrendItem[]> {
  const client = getClient('perplexity');
  const query = buildPerplexityQuery(ctx);
  const completion = await client.chat.completions.create({
    model: 'sonar-pro',
    messages: [
      { role: 'system', content: 'You are a web research assistant. Output only valid JSON.' },
      { role: 'user', content: query },
    ],
    max_tokens: 800,
    temperature: 0.2,
  });
  const text = completion.choices?.[0]?.message?.content || '[]';
  let items: any[] = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    // Best-effort URL extraction if JSON failed
    const urlRegex = /(https?:\/\/[^\s)\]]+)/g;
    const urls = Array.from(new Set(text.match(urlRegex) || [])).slice(0, limit);
    items = urls.map((u) => ({ title: u, url: u, source: 'web' }));
  }
  const mapped: TrendItem[] = items
    .map((r) => ({
      title: String(r?.title || '').trim().slice(0, 200),
      url: String(r?.url || '').trim(),
      source: (['news','reddit','youtube','x','linkedin','web'].includes(String(r?.source)) ? r.source : 'web') as TrendItem['source'],
      published_at: r?.published_at ? String(r.published_at) : null,
    }))
    .filter((x) => x.title && x.url)
    .slice(0, limit);
  return mapped;
}

async function fetchYouTubeRecencyTrends(
  accessToken: string,
  ctx: ChannelContext,
  limit = 10
): Promise<TrendItem[]> {
  // Heuristic queries: pick prominent keywords from about/title; fallback to generic
  const seeds: string[] = [];
  const lower = (ctx.aboutText || '').toLowerCase() + ' ' + (ctx.channelTitle || '').toLowerCase();
  if (/(figma|adobe|sketch|ux|ui|product design)/i.test(lower)) {
    if (/figma/i.test(lower)) seeds.push('Figma update');
    if (/adobe/i.test(lower)) seeds.push('Adobe update');
    seeds.push('UI design news');
    seeds.push('UX debate');
  }
  if (seeds.length === 0) {
    seeds.push('latest update');
    seeds.push('news');
  }

  const publishedAfter = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const collected: TrendItem[] = [];
  for (const q of seeds) {
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=10&publishedAfter=${encodeURIComponent(publishedAfter)}&q=${encodeURIComponent(q)}`;
      const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const json = await res.json();
      const items: any[] = Array.isArray(json?.items) ? json.items : [];
      for (const it of items) {
        const vid = it?.id?.videoId as string | undefined;
        const title = it?.snippet?.title as string | undefined;
        const publishedAt = it?.snippet?.publishedAt as string | undefined;
        if (!vid || !title) continue;
        collected.push({
          title: title.trim(),
          url: `https://www.youtube.com/watch?v=${vid}`,
          source: 'youtube',
          published_at: publishedAt || null,
        });
        if (collected.length >= limit) break;
      }
      if (collected.length >= limit) break;
    } catch {}
  }
  return collected.slice(0, limit);
}

function scoreTrend(item: TrendItem): number {
  const now = Date.now();
  const ts = item.published_at ? Date.parse(item.published_at) : NaN;
  const hours = Number.isFinite(ts) ? Math.max(0, (now - ts) / 36e5) : 168; // default 7d old
  const recency = 1 / (1 + hours / 12);
  const sourceWeight = item.source === 'web' || item.source === 'news' ? 1.0 : item.source === 'youtube' ? 0.9 : 0.85;
  return Math.round((recency * 0.7 + sourceWeight * 0.3) * 1000) / 1000;
}

function dedupeByUrl(items: TrendItem[]): TrendItem[] {
  const seen = new Set<string>();
  const out: TrendItem[] = [];
  for (const it of items) {
    const key = (it.url || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export async function refreshTrendsForChannel(
  userId: string,
  externalChannelId: string,
  opts?: { force?: boolean; limit?: number }
): Promise<{ items: TrendItem[]; internalChannelId: string; fetchedAt: string; expiresAt: string } | null> {
  const supabase = await createSupabaseServerClient();

  const resolved = await loadChannelContextBasic(supabase, userId, externalChannelId);
  if (!resolved) return null;
  const { internalChannelId, ctx } = resolved;

  // TTL check
  if (!opts?.force) {
    const { data: existing } = await supabase
      .from('trends')
      .select('id, fetched_at, expires_at')
      .eq('channel_id', internalChannelId)
      .eq('user_id', userId)
      .order('fetched_at', { ascending: false })
      .limit(1);
    if ((existing || []).length > 0) {
      const ex = existing[0];
      if (ex?.expires_at && Date.parse(ex.expires_at) > Date.now()) {
        // Still fresh
        return null;
      }
    }
  }

  // Providers
  const limit = Math.max(1, Math.min(10, opts?.limit ?? 10));
  let items: TrendItem[] = [];
  try {
    const pp = await fetchPerplexityTrends(ctx, limit);
    items = items.concat(pp);
  } catch {}

  // YouTube provider (best-effort): requires valid token for this user/channel
  try {
    // Attempt to find a token bound to this channel's google_sub if available, else any valid access_token
    const admin = createSupabaseAdminClient();
    const { data: ga } = await admin
      .from('google_accounts')
      .select('access_token')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (ga?.access_token) {
      const yt = await fetchYouTubeRecencyTrends(ga.access_token as string, ctx, limit);
      items = items.concat(yt);
    }
  } catch {}

  items = dedupeByUrl(items).slice(0, limit);
  items = items.map((it) => ({ ...it, score: scoreTrend(it) }));
  items.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Persist: clear previous rows and insert fresh set
  const admin = createSupabaseAdminClient();
  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRENDS_TTL_MS).toISOString();
  await admin.from('trends').delete().eq('channel_id', internalChannelId).eq('user_id', userId);
  if (items.length > 0) {
    const rows = items.map((it) => ({
      user_id: userId,
      channel_id: internalChannelId,
      title: it.title,
      url: it.url,
      source: it.source,
      topic_cluster: ctx.topicCluster || null,
      published_at: it.published_at || null,
      score: it.score ?? null,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
    }));
    await admin.from('trends').insert(rows);
  }

  return { items, internalChannelId, fetchedAt, expiresAt };
}

export async function getTrendsForChannel(
  userId: string,
  externalChannelId: string
): Promise<{ items: TrendItem[]; stale: boolean; fetchedAt?: string; expiresAt?: string; internalChannelId?: string }> {
  const supabase = await createSupabaseServerClient();
  const resolved = await loadChannelContextBasic(supabase, userId, externalChannelId);
  if (!resolved) return { items: [], stale: true };
  const { internalChannelId } = resolved;

  const { data: rows } = await supabase
    .from('trends')
    .select('title, url, source, published_at, score, fetched_at, expires_at')
    .eq('channel_id', internalChannelId)
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(10);

  if (!rows || rows.length === 0) return { items: [], stale: true, internalChannelId };
  const fetchedAt = rows[0]?.fetched_at as string | undefined;
  const expiresAt = rows[0]?.expires_at as string | undefined;
  const stale = !expiresAt || Date.parse(expiresAt) <= Date.now();

  const items: TrendItem[] = rows.map((r: any) => ({
    title: r.title,
    url: r.url,
    source: r.source,
    published_at: r.published_at,
    score: r.score,
  }));

  return { items, stale, fetchedAt, expiresAt, internalChannelId };
}


