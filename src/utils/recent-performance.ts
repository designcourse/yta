import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { computeQuantiles, Quantiles } from '@/utils/baselines';

export interface VideoMetric {
  video_id: string;
  published_at: string;
  views: number | null;
  avd_24h: number | null; // mapped from avg_view_duration_sec
  vpd_24h: number | null; // mapped from views_per_day
  retention_pct: number | null; // mapped from avg_view_pct
  ctr_24h: number | null; // mapped from ctr
}

export interface RecentPerformanceBaseline {
  videos: VideoMetric[];
  sampleSize: number;
  window: {
    start: Date;
    end: Date;
    reason: string;
  };
  quantiles: {
    ctr_24h: Quantiles | null;
    avd_24h: Quantiles | null;
    vpd_24h: Quantiles | null;
    retention_pct: Quantiles | null;
  };
  confidence: 'low' | 'medium' | 'high';
  message?: string; // For new users with <10 videos
}

/**
 * Get recent performance baseline for a channel
 * Window: Last 10-15 videos OR 90 days, whichever captures fewer videos
 */
export async function getRecentPerformanceBaseline(
  userId: string,
  channelId: string
): Promise<RecentPerformanceBaseline> {
  const admin = createSupabaseAdminClient();

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Fetch last 15 videos, ordered by published date
  const { data: rawVideos, error } = await admin
    .from('video_metrics')
    .select('video_id, published_at, views, avg_view_duration_sec, views_per_day, avg_view_pct, ctr')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .order('published_at', { ascending: false })
    .limit(15);

  if (error || !rawVideos || rawVideos.length === 0) {
    return createEmptyBaseline('No video data found');
  }

  // Map DB columns to baseline-friendly names
  const allVideos: VideoMetric[] = rawVideos.map((v: any) => ({
    video_id: v.video_id,
    published_at: v.published_at,
    views: v.views ?? null,
    avd_24h: v.avg_view_duration_sec ?? null,
    vpd_24h: v.views_per_day ?? null,
    retention_pct: v.avg_view_pct ?? null,
    ctr_24h: v.ctr ?? null,
  }));

  // Filter to only include videos within 90 days
  const recentVideos = allVideos.filter(v => 
    new Date(v.published_at) >= ninetyDaysAgo
  );

  // If we have fewer than 10 videos, return with low confidence warning
  if (recentVideos.length < 10) {
    const baseline = calculateBaseline(recentVideos);
    baseline.confidence = 'low';
    baseline.message = `You need ~${10 - recentVideos.length} more videos in our system before we can provide solid T+3hr insights. For now, wait 24 hours after upload for YouTube's full analytics.`;
    return baseline;
  }

  // Calculate baseline from recent videos
  const baseline = calculateBaseline(recentVideos);
  
  // Set confidence based on sample size
  if (recentVideos.length >= 15) {
    baseline.confidence = 'high';
  } else if (recentVideos.length >= 10) {
    baseline.confidence = 'medium';
  } else {
    baseline.confidence = 'low';
  }

  return baseline;
}

/**
 * Calculate quantiles and window info from video list
 */
function calculateBaseline(videos: VideoMetric[]): RecentPerformanceBaseline {
  if (videos.length === 0) {
    return createEmptyBaseline('No videos available');
  }

  const dates = videos.map(v => new Date(v.published_at));
  const oldest = new Date(Math.min(...dates.map(d => d.getTime())));
  const newest = new Date(Math.max(...dates.map(d => d.getTime())));
  const daySpan = Math.ceil((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));

  // Extract metric values for quantile calculation
  const ctrValues = videos.map(v => v.ctr_24h).filter((v): v is number => v !== null && Number.isFinite(v));
  const avdValues = videos.map(v => v.avd_24h).filter((v): v is number => v !== null && Number.isFinite(v));
  const vpdValues = videos.map(v => v.vpd_24h).filter((v): v is number => v !== null && Number.isFinite(v));
  const retValues = videos.map(v => v.retention_pct).filter((v): v is number => v !== null && Number.isFinite(v));

  return {
    videos,
    sampleSize: videos.length,
    window: {
      start: oldest,
      end: newest,
      reason: `Based on your last ${videos.length} videos (past ${daySpan} days)`,
    },
    quantiles: {
      ctr_24h: computeQuantiles(ctrValues),
      avd_24h: computeQuantiles(avdValues),
      vpd_24h: computeQuantiles(vpdValues),
      retention_pct: computeQuantiles(retValues),
    },
    confidence: videos.length >= 15 ? 'high' : videos.length >= 10 ? 'medium' : 'low',
  };
}

/**
 * Create empty baseline for error cases
 */
function createEmptyBaseline(message: string): RecentPerformanceBaseline {
  return {
    videos: [],
    sampleSize: 0,
    window: {
      start: new Date(),
      end: new Date(),
      reason: message,
    },
    quantiles: {
      ctr_24h: null,
      avd_24h: null,
      vpd_24h: null,
      retention_pct: null,
    },
    confidence: 'low',
    message,
  };
}

/**
 * Determine channel stage based on video count and age
 */
export function determineChannelStage(totalVideos: number): 'new' | 'early' | 'growing' | 'mature' {
  if (totalVideos < 10) return 'new';
  if (totalVideos < 50) return 'early';
  if (totalVideos < 100) return 'growing';
  return 'mature';
}

/**
 * Calculate uploads per month over last 90 days
 */
export async function calculateUploadFrequency(
  userId: string,
  channelId: string
): Promise<number> {
  const admin = createSupabaseAdminClient();

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: recentVideos } = await admin
    .from('video_metrics')
    .select('video_id')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .gte('published_at', ninetyDaysAgo.toISOString());

  const videoCount = recentVideos?.length || 0;
  
  // Convert to uploads per month
  return Math.round((videoCount / 90) * 30 * 10) / 10; // Round to 1 decimal
}

