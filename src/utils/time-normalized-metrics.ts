/**
 * Time-normalized metrics utilities for fair video performance comparison
 * 
 * The core issue: comparing a 1-day-old video's VPD against 30-day-old videos' lifetime VPD
 * is meaningless. We need to compare apples-to-apples: first day vs first day.
 */

export interface VideoMetric {
  video_id: string;
  views: number;
  published_at: string;
  views_per_day: number;
  avg_view_duration_sec: number | null;
  avg_view_pct: number | null;
  is_short: boolean;
  length_band: string | null;
  topic_cluster: string | null;
}

export interface TimeNormalizedMetric {
  video_id: string;
  normalized_vpd: number;
  normalized_avd: number | null;
  normalized_retention: number | null;
  confidence: number; // 0-1, how reliable this normalization is
  method: 'actual' | 'projected' | 'estimated';
}

function daysDiff(fromISO: string, to = new Date()): number {
  if (!fromISO) return 0;
  const d = new Date(fromISO);
  const diff = to.getTime() - d.getTime();
  return Math.max(0, Math.floor(diff / (24 * 3600 * 1000)));
}

/**
 * Calculate time-normalized VPD for fair comparison
 * 
 * @param currentVideo The video we're analyzing
 * @param compareVideos Other videos to compare against
 * @param targetDays The time window to normalize to (e.g., 1 day, 7 days)
 */
export function calculateTimeNormalizedVPD(
  currentVideo: VideoMetric,
  compareVideos: VideoMetric[],
  targetDays: number = 1
): {
  current: TimeNormalizedMetric;
  baselines: TimeNormalizedMetric[];
} {
  const currentAge = daysDiff(currentVideo.published_at);
  
  // For the current video, use actual data if within target window
  const current: TimeNormalizedMetric = {
    video_id: currentVideo.video_id,
    normalized_vpd: currentAge <= targetDays 
      ? currentVideo.views / Math.max(1, currentAge) 
      : currentVideo.views_per_day, // fallback to lifetime average
    normalized_avd: currentVideo.avg_view_duration_sec,
    normalized_retention: currentVideo.avg_view_pct,
    confidence: currentAge <= targetDays ? 1.0 : 0.3,
    method: currentAge <= targetDays ? 'actual' : 'estimated'
  };

  // For comparison videos, project their performance at targetDays
  const baselines: TimeNormalizedMetric[] = compareVideos.map(video => {
    const videoAge = daysDiff(video.published_at);
    
    if (videoAge <= targetDays) {
      // Video is young enough - use actual data
      return {
        video_id: video.video_id,
        normalized_vpd: video.views / Math.max(1, videoAge),
        normalized_avd: video.avg_view_duration_sec,
        normalized_retention: video.avg_view_pct,
        confidence: 1.0,
        method: 'actual'
      };
    } else if (videoAge <= 7) {
      // Video is 2-7 days old - project backwards using decay model
      // Assume 70% of views come in first day, 20% in day 2-3, 10% after
      const estimatedDay1Views = estimateEarlyViews(video.views, videoAge);
      return {
        video_id: video.video_id,
        normalized_vpd: estimatedDay1Views,
        normalized_avd: video.avg_view_duration_sec,
        normalized_retention: video.avg_view_pct,
        confidence: 0.7,
        method: 'projected'
      };
    } else {
      // Video is old - use statistical estimation
      // Look at the pattern: older videos tend to have lower lifetime VPD
      // Estimate their day-1 performance was ~3-5x their lifetime VPD
      const multiplier = Math.min(5, Math.max(2, 100 / videoAge)); // 2x-5x based on age
      return {
        video_id: video.video_id,
        normalized_vpd: video.views_per_day * multiplier,
        normalized_avd: video.avg_view_duration_sec,
        normalized_retention: video.avg_view_pct,
        confidence: 0.4,
        method: 'estimated'
      };
    }
  });

  return { current, baselines };
}

/**
 * Estimate what a video's first-day views were based on its current performance
 * Uses a simple decay model where most views happen early
 */
function estimateEarlyViews(totalViews: number, currentAge: number): number {
  if (currentAge <= 1) return totalViews;
  
  // Simple decay model: 50% day 1, 25% day 2, 15% day 3, 10% after
  const decayPattern = [0.5, 0.25, 0.15, 0.1];
  
  if (currentAge <= 4) {
    // Sum up the decay pattern for the days that have passed
    const totalDecayForAge = decayPattern.slice(0, currentAge).reduce((sum, rate) => sum + rate, 0);
    // Estimate day 1 views
    return totalViews * (decayPattern[0] / totalDecayForAge);
  } else {
    // For older videos, assume day 1 was ~40% of total views
    return totalViews * 0.4;
  }
}

/**
 * Calculate confidence-weighted quantiles for time-normalized metrics
 */
export function computeWeightedQuantiles(metrics: TimeNormalizedMetric[]): {
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  count: number;
  avgConfidence: number;
} | null {
  if (metrics.length === 0) return null;

  // Sort by normalized VPD
  const sorted = [...metrics].sort((a, b) => a.normalized_vpd - b.normalized_vpd);
  
  // Weight by confidence - higher confidence metrics count more
  const weightedValues: number[] = [];
  sorted.forEach(metric => {
    const weight = Math.max(1, Math.round(metric.confidence * 3)); // 1-3 weight
    for (let i = 0; i < weight; i++) {
      weightedValues.push(metric.normalized_vpd);
    }
  });

  const len = weightedValues.length;
  const median = len % 2 === 0 
    ? (weightedValues[len / 2 - 1] + weightedValues[len / 2]) / 2
    : weightedValues[Math.floor(len / 2)];
  
  const q1 = weightedValues[Math.floor(len * 0.25)];
  const q3 = weightedValues[Math.floor(len * 0.75)];
  
  return {
    median,
    q1,
    q3,
    iqr: q3 - q1,
    count: metrics.length,
    avgConfidence: metrics.reduce((sum, m) => sum + m.confidence, 0) / metrics.length
  };
}
