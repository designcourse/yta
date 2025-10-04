import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export type BucketTrend = 'improving' | 'stable' | 'declining';
export type UploadFrequency = 'high' | 'medium' | 'low';
export type TopicSaturation = 'low' | 'medium' | 'high';

export interface EnhancedBucketMetrics {
  trend: BucketTrend;
  uploadFrequency: UploadFrequency;
  recommended: boolean;
  topicSaturation: TopicSaturation;
}

export interface BucketVideo {
  video_id: string;
  views: number;
  published_at: string;
}

/**
 * Analyze bucket trend by comparing recent vs previous performance
 * Recent = last 5 videos, Previous = 5 before that
 */
export function analyzeBucketTrend(videos: BucketVideo[]): BucketTrend {
  if (videos.length < 6) return 'stable'; // Need at least 6 videos for trend

  // Sort by published date (newest first)
  const sorted = [...videos].sort((a, b) => 
    new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );

  // Split into recent 5 and previous 5
  const recent5 = sorted.slice(0, 5);
  const previous5 = sorted.slice(5, 10);

  if (previous5.length < 3) return 'stable'; // Not enough historical data

  // Calculate median views for each group
  const recentMedian = median(recent5.map(v => v.views));
  const previousMedian = median(previous5.map(v => v.views));

  if (previousMedian === 0) return 'stable';

  const changeRatio = recentMedian / previousMedian;

  // Improving: recent performance is 20%+ better
  if (changeRatio >= 1.2) return 'improving';
  
  // Declining: recent performance is 20%+ worse
  if (changeRatio <= 0.8) return 'declining';

  return 'stable';
}

/**
 * Calculate upload frequency for this bucket
 */
export function calculateUploadFrequency(videos: BucketVideo[]): UploadFrequency {
  if (videos.length === 0) return 'low';

  // Get date range of videos
  const dates = videos.map(v => new Date(v.published_at).getTime());
  const oldest = Math.min(...dates);
  const newest = Math.max(...dates);
  const daySpan = (newest - oldest) / (1000 * 60 * 60 * 24);

  if (daySpan === 0) return 'low'; // Single video

  const videosPerMonth = (videos.length / daySpan) * 30;

  if (videosPerMonth >= 4) return 'high';    // 1+ per week
  if (videosPerMonth >= 1) return 'medium';  // ~1 per month
  return 'low';                               // Less than monthly
}

/**
 * Determine topic saturation level
 */
export function assessTopicSaturation(videoCount: number): TopicSaturation {
  if (videoCount < 10) return 'low';
  if (videoCount <= 25) return 'medium';
  return 'high';
}

/**
 * Determine if bucket should be recommended for next video
 * Recommended if: high success score AND not oversaturated
 */
export function shouldRecommendBucket(
  successScore: number,
  saturation: TopicSaturation,
  trend: BucketTrend,
  allScores: number[]
): boolean {
  // Must be in top 50% of buckets by success score
  const sortedScores = [...allScores].sort((a, b) => b - a);
  const medianScore = median(sortedScores);
  
  if (successScore < medianScore) return false;

  // Don't recommend highly saturated topics unless they're still trending up
  if (saturation === 'high' && trend !== 'improving') return false;

  // Don't recommend declining buckets
  if (trend === 'declining') return false;

  return true;
}

/**
 * Get enhanced metrics for all buckets in a channel
 */
export async function getEnhancedBucketMetrics(
  userId: string,
  channelId: string
): Promise<Map<string, EnhancedBucketMetrics>> {
  const admin = createSupabaseAdminClient();
  
  // Get all buckets
  const { data: buckets } = await admin
    .from('content_buckets')
    .select('id, bucket_key')
    .eq('user_id', userId)
    .eq('channel_id', channelId);

  if (!buckets || buckets.length === 0) {
    return new Map();
  }

  // Get video metrics for all buckets
  const { data: videoMetrics } = await admin
    .from('video_metrics')
    .select('video_id, bucket_id, views, published_at')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .not('bucket_id', 'is', null)
    .order('published_at', { ascending: false });

  if (!videoMetrics) {
    return new Map();
  }

  // Calculate success scores for all buckets (for recommendation logic)
  const bucketScores = new Map<string, number>();
  for (const bucket of buckets) {
    const bucketVideos = videoMetrics.filter(v => v.bucket_id === bucket.id);
    const views = bucketVideos.map(v => v.views || 0).filter(v => v > 0);
    const medianViews = views.length > 0 ? median(views) : 0;
    bucketScores.set(bucket.id, medianViews);
  }
  const allScores = Array.from(bucketScores.values());

  // Calculate enhanced metrics for each bucket
  const enhancedMetrics = new Map<string, EnhancedBucketMetrics>();

  for (const bucket of buckets) {
    const bucketVideos = videoMetrics.filter(v => v.bucket_id === bucket.id);
    const videoCount = bucketVideos.length;
    const successScore = bucketScores.get(bucket.id) || 0;

    const trend = analyzeBucketTrend(bucketVideos);
    const uploadFrequency = calculateUploadFrequency(bucketVideos);
    const topicSaturation = assessTopicSaturation(videoCount);
    const recommended = shouldRecommendBucket(successScore, topicSaturation, trend, allScores);

    enhancedMetrics.set(bucket.id, {
      trend,
      uploadFrequency,
      recommended,
      topicSaturation,
    });
  }

  return enhancedMetrics;
}

// Helper: Calculate median of an array
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

