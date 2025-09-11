import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { COLLECTION_SAMPLE_SIZE, COLLECTION_TTL_HOURS } from '@/utils/config';
import { NeriaInput } from '@/utils/types/neria';

type AggregateParams = {
  userId: string;
  channelId: string;
  accessToken: string;
  refreshToken?: string | null;
};

type WinnerCard = {
  id: string;
  title: string;
  thumb: string;
  publishedAt: string;
  duration: string;
  metrics: { views: number; avgViewPct: number; viewsPerDay: number };
};

type LoserCard = {
  id: string;
  title: string;
  thumb: string;
  publishedAt: string;
  duration: string;
};

function parseISODurationToSeconds(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s;
}

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function daysDiff(fromISO: string, to = new Date()): number {
  if (!fromISO) return 0;
  const d = new Date(fromISO);
  const diff = to.getTime() - d.getTime();
  return Math.max(0, Math.floor(diff / (24 * 3600 * 1000)));
}

async function fetchJson(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${url} failed: ${res.status} ${t}`);
  }
  return res.json();
}

export async function aggregateYouTubeData(params: AggregateParams): Promise<{ neriaInput: NeriaInput; winners: WinnerCard[]; losers: LoserCard[]; lifetimeViews: number }>
{
  const { userId, channelId, accessToken } = params;
  const admin = createSupabaseAdminClient();

  // Try cache first
  try {
    const { data: cached } = await admin
      .from('collection_cache')
      .select('payload_json, winners_json, losers_json, created_at')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .single();
    if (cached) {
      const createdAt = cached.created_at ? new Date(cached.created_at) : null;
      if (createdAt && Date.now() - createdAt.getTime() < COLLECTION_TTL_HOURS * 3600 * 1000) {
        if (cached.payload_json && cached.winners_json && cached.losers_json) {
          return {
            neriaInput: cached.payload_json as NeriaInput,
            winners: cached.winners_json as WinnerCard[],
            losers: cached.losers_json as LoserCard[],
          };
        }
      }
    }
  } catch {}

  // CHANNEL SNAPSHOT
  const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}`;
  const channelsJson = await fetchJson(channelsUrl, accessToken);
  const ch = channelsJson?.items?.[0];
  if (!ch) throw new Error('Channel not found');

  const channelCreatedAt = ch?.snippet?.publishedAt || '';
  const ageDays = channelCreatedAt ? daysDiff(channelCreatedAt) : 0;
  const subscribers = Number(ch?.statistics?.subscriberCount || 0);
  const videoCount = Number(ch?.statistics?.videoCount || 0);
  const totalViews = Number(ch?.statistics?.viewCount || 0);

  // Establish rolling window
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 90);

  // LATEST VIDEOS (SEARCH) - bound to last 90 days
  let searchN = COLLECTION_SAMPLE_SIZE;
  let searchItems: any[] = [];
  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&type=video&order=date&maxResults=${searchN}&publishedAfter=${encodeURIComponent(start.toISOString())}&publishedBefore=${encodeURIComponent(end.toISOString())}`;
    console.log('[aggregator] search URL', searchUrl);
    const searchJson = await fetchJson(searchUrl, accessToken);
    searchItems = Array.isArray(searchJson?.items) ? searchJson.items : [];
  } catch {
    searchN = 5;
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&type=video&order=date&maxResults=${searchN}&publishedAfter=${encodeURIComponent(start.toISOString())}&publishedBefore=${encodeURIComponent(end.toISOString())}`;
      const searchJson = await fetchJson(searchUrl, accessToken);
      searchItems = Array.isArray(searchJson?.items) ? searchJson.items : [];
    } catch {}
  }

  // DEBUG: basic cardinalities
  console.log('[aggregator] search count', searchItems.length);

  const videoIds = searchItems.map((it: any) => it?.id?.videoId).filter(Boolean) as string[];
  const publishedAtMap = new Map<string, string>();
  const titleMap = new Map<string, string>();
  for (const it of searchItems) {
    const vid = it?.id?.videoId;
    if (vid) {
      const pub = it?.snippet?.publishTime || it?.snippet?.publishedAt || '';
      publishedAtMap.set(vid, pub);
      titleMap.set(vid, it?.snippet?.title || '');
    }
  }

  // VIDEOS DETAILS
  let videoDetails: any[] = [];
  if (videoIds.length > 0) {
    const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(videoIds.join(','))}`;
    const videosJson = await fetchJson(videosUrl, accessToken);
    videoDetails = Array.isArray(videosJson?.items) ? videosJson.items : [];
  }
  console.log('[aggregator] videos details count', videoDetails.length);

  // ANALYTICS ROLLUP
  const analyticsParams = new URLSearchParams({
    ids: `channel==MINE`,
    startDate: formatDateISO(start),
    endDate: formatDateISO(end),
    metrics: 'views,estimatedMinutesWatched,impressions,impressionsCtr,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost',
  });
  let rollupViews = 0;
  let rollupImpressions = 0;
  let rollupCtr: number | null = null;
  let rollupAvgDur: number | null = null;
  let rollupAvgPct: number | null = null;
  let rollupSubsNet = 0;
  try {
    // Try channel-specific first, then MINE as fallback
    const attempts = [
      new URLSearchParams({
        ids: `channel==${channelId}`,
        startDate: formatDateISO(start),
        endDate: formatDateISO(end),
        metrics: 'views,estimatedMinutesWatched,impressions,impressionsCtr,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost',
      }),
      analyticsParams,
    ];
    for (const p of attempts) {
      const rollRes = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${p.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!rollRes.ok) continue;
      const rjson = await rollRes.json();
      console.log('[aggregator] rollup rows', Array.isArray(rjson?.rows) ? rjson.rows.length : 'none', 'totals?', Array.isArray(rjson?.totals));
      const totals = Array.isArray(rjson?.totals) ? rjson.totals[0] : Array.isArray(rjson?.rows) ? rjson.rows[0] : null;
      if (Array.isArray(totals)) {
        rollupViews = Number(totals[0] ?? 0);
        const estMin = Number(totals[1] ?? 0);
        rollupImpressions = Number(totals[2] ?? 0);
        rollupCtr = totals[3] != null ? Number(totals[3]) : null;
        rollupAvgDur = totals[4] != null ? Number(totals[4]) : null;
        rollupAvgPct = totals[5] != null ? Number(totals[5]) : null;
        const subsG = Number(totals[6] ?? 0);
        const subsL = Number(totals[7] ?? 0);
        rollupSubsNet = subsG - subsL;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _watchTimeHours = estMin / 60;
        break;
      }
    }
  } catch {}

  // PER-VIDEO ANALYTICS
  const perVideoMap = new Map<string, { impressions: number; ctr: number | null; avgViewDur: number | null; avgViewPct: number | null; views: number }>();
  if (videoIds.length > 0) {
    const pvParams = new URLSearchParams({
      ids: `channel==${channelId}`,
      startDate: formatDateISO(start),
      endDate: formatDateISO(end),
      dimensions: 'video',
      filters: `video==${videoIds.join(',')}`,
      metrics: 'impressions,impressionsCtr,averageViewDuration,averageViewPercentage,views',
    });
    try {
      let pvRes = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${pvParams.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!pvRes.ok) {
        const fallback = new URLSearchParams(pvParams);
        fallback.set('ids', 'channel==MINE');
        pvRes = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${fallback.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      }
      if (pvRes.ok) {
        const pvJson = await pvRes.json();
        const rows: any[] = Array.isArray(pvJson?.rows) ? pvJson.rows : [];
        console.log('[aggregator] per-video rows', rows.length);
        for (const r of rows) {
          const vid = String(r[0] ?? '');
          const impressions = Number(r[1] ?? 0);
          const ctr = r[2] != null ? Number(r[2]) : null;
          const avgViewDur = r[3] != null ? Number(r[3]) : null;
          const avgViewPct = r[4] != null ? Number(r[4]) : null;
          const views = Number(r[5] ?? 0);
          perVideoMap.set(vid, { impressions, ctr, avgViewDur, avgViewPct, views });
        }
      }
    } catch {}
  }

  // Build recentUploads enriched
  const now = new Date();
  const recentUploads: NeriaInput['recentUploads'] = videoDetails.map((it: any) => {
    const id = String(it?.id || '');
    const snippet = it?.snippet || {};
    const stats = it?.statistics || {};
    const durationSec = parseISODurationToSeconds(it?.contentDetails?.duration || '');
    const pv = perVideoMap.get(id) || { impressions: 0, ctr: null, avgViewDur: null, avgViewPct: null, views: Number(stats?.viewCount || 0) };
    return {
      id,
      title: snippet?.title || titleMap.get(id) || '',
      publishedAt: snippet?.publishedAt || publishedAtMap.get(id) || '',
      durationSec,
      isShort: durationSec < 61,
      views: pv.views,
      impressions: pv.impressions,
      ctr: pv.ctr,
      avgViewDurationSec: pv.avgViewDur,
      avgViewPct: pv.avgViewPct,
      comments: Number(stats?.commentCount || 0),
      likes: Number(stats?.likeCount || 0),
    };
  });

  // Derived
  const uploadedDates = recentUploads.length > 0 ? recentUploads.map(v => v.publishedAt) : Array.from(publishedAtMap.values());
  const within30FromSearch = Array.from(publishedAtMap.values()).filter(d => d && new Date(d) >= start).filter(d => daysDiff(d, now) <= 30).length;
  const within90FromSearch = Array.from(publishedAtMap.values()).filter(d => d && new Date(d) >= start).length;
  console.log('[aggregator] uploadedDates within 90d (details)', uploadedDates.filter(d => daysDiff(d, now) <= 90).length, 'from search', within90FromSearch);
  const lastUploadDaysAgo = uploadedDates.length > 0 ? Math.min(...uploadedDates.map(d => daysDiff(d, now))) : null;
  // Prefer counts using search timestamps (less likely to be missing)
  const per30d = within30FromSearch;
  const per90d = within90FromSearch;

  // Aggregate per-video metrics if rollups missing
  const perAvgPctVals = Array.from(perVideoMap.values()).map(v => v.avgViewPct).filter((x): x is number => x != null);
  const perAvgDurVals = Array.from(perVideoMap.values()).map(v => v.avgViewDur).filter((x): x is number => x != null);
  const perCtrVals = Array.from(perVideoMap.values()).map(v => v.ctr).filter((x): x is number => x != null);
  const mean = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : null;
  const fallbackAvgPct = rollupAvgPct == null ? mean(perAvgPctVals) : rollupAvgPct;
  const fallbackAvgDur = rollupAvgDur == null ? mean(perAvgDurVals) : rollupAvgDur;
  const fallbackCtr = rollupCtr == null ? mean(perCtrVals) : rollupCtr;
  console.log('[aggregator] per-video metrics counts', { avgPct: perAvgPctVals.length, avgDur: perAvgDurVals.length, ctr: perCtrVals.length });
  console.log('[aggregator] rollup/fallback avgPct', fallbackAvgPct, 'avgDur', fallbackAvgDur, 'ctr', fallbackCtr);

  const rollupWatchTimeHours = null as unknown as number | null; // not strictly needed in UI; kept for schema
  const dataGaps: string[] = [];
  const hasPerVideoCtr = Array.from(perVideoMap.values()).some(v => v.ctr != null);
  const hasPerVideoAvgPct = Array.from(perVideoMap.values()).some(v => v.avgViewPct != null);
  if (rollupCtr == null && !hasPerVideoCtr) dataGaps.push('ctr');
  if (rollupAvgPct == null && !hasPerVideoAvgPct) dataGaps.push('avgViewPct');

  const neriaInput: NeriaInput = {
    channel: {
      id: channelId,
      title: ch?.snippet?.title || '',
      createdAt: channelCreatedAt,
      ageDays,
      country: (ch?.snippet?.country as string | undefined) || null,
      subscribers,
      videoCount,
      lastUploadDaysAgo,
      nicheGuess: null,
    },
    recentUploads,
    rollups: {
      period: { start: formatDateISO(start), end: formatDateISO(end), days: 90 },
      counts: {
        uploads: per90d,
        shorts: recentUploads.filter(r => r.isShort && daysDiff(r.publishedAt, now) <= 90).length,
        longForm: recentUploads.filter(r => !r.isShort && daysDiff(r.publishedAt, now) <= 90).length,
      },
      metrics: {
        views: rollupViews,
        watchTimeHours: rollupWatchTimeHours ?? 0,
        avgViewDurationSec: fallbackAvgDur,
        avgViewPct: fallbackAvgPct,
        impressions: rollupImpressions,
        ctr: fallbackCtr,
        subsNet: rollupSubsNet,
      },
    },
    cadence: { per30d, per90d },
    titleSamples: recentUploads.slice(0, Math.min(20, Math.max(10, recentUploads.length))).map(v => v.title),
    benchmarks: undefined,
    dataGaps,
  };

  // Winners/Losers computation
  const withVpd = recentUploads.map(v => {
    const days = Math.max(1, Math.min(90, daysDiff(v.publishedAt, now)));
    const vpd = v.views / days;
    return { v, vpd };
  });
  withVpd.sort((a, b) => b.vpd - a.vpd);
  const top = withVpd.slice(0, Math.min(10, withVpd.length));
  const winners: WinnerCard[] = top.map(({ v }) => {
    const vid = v.id;
    const det = videoDetails.find((it: any) => String(it?.id || '') === vid);
    const thumb = det?.snippet?.thumbnails?.medium?.url || det?.snippet?.thumbnails?.default?.url || '';
    const duration = det?.contentDetails?.duration || '';
    return {
      id: vid,
      title: v.title,
      thumb,
      publishedAt: v.publishedAt,
      duration,
      metrics: { views: v.views, avgViewPct: v.avgViewPct ?? 0, viewsPerDay: Math.round((v.views / Math.max(1, Math.min(90, daysDiff(v.publishedAt, now)))) * 100) / 100 },
    };
  });

  const aged = withVpd.filter(x => daysDiff(x.v.publishedAt, now) >= 7);
  const worst = (aged.length > 0 ? aged : withVpd).slice(-1);
  const losers: LoserCard[] = worst.map(({ v }) => {
    const vid = v.id;
    const det = videoDetails.find((it: any) => String(it?.id || '') === vid);
    const thumb = det?.snippet?.thumbnails?.medium?.url || det?.snippet?.thumbnails?.default?.url || '';
    const duration = det?.contentDetails?.duration || '';
    return { id: vid, title: v.title, thumb, publishedAt: v.publishedAt, duration };
  });

  // Cache to Supabase
  try {
    await admin.from('collection_cache').upsert({
      user_id: userId,
      channel_id: channelId,
      payload_json: neriaInput,
      winners_json: winners,
      losers_json: losers,
    }, { onConflict: 'user_id,channel_id' });
  } catch {}

  return { neriaInput, winners, losers, lifetimeViews: totalViews };
}


