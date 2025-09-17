/**
 * YouTube Analytics API integration for accurate time-windowed metrics
 * 
 * This replaces our estimation-based approach with real YouTube data
 * for precise first-X-hours/days comparisons.
 */

interface YouTubeAnalyticsConfig {
  accessToken: string;
  channelId: string;
}

interface TimeWindowedMetrics {
  videoId: string;
  timeWindow: string; // e.g., "1h", "6h", "24h", "48h"
  views: number;
  watchTimeMinutes: number;
  averageViewDuration: number;
  subscribersGained: number;
  impressions?: number;
  ctr?: number;
  confidence: 'high' | 'medium' | 'low'; // Based on data availability
}

/**
 * Determine the optimal time window based on video age
 */
export function getOptimalTimeWindow(videoAgeHours: number): string {
  if (videoAgeHours <= 1) return '1h';
  if (videoAgeHours <= 6) return '6h';
  if (videoAgeHours <= 12) return '12h';
  if (videoAgeHours <= 24) return '24h';
  if (videoAgeHours <= 48) return '48h';
  if (videoAgeHours <= 168) return '7d'; // 7 days
  return '30d';
}

/**
 * Calculate hours between two dates
 */
function hoursDiff(fromISO: string, to = new Date()): number {
  if (!fromISO) return 0;
  const d = new Date(fromISO);
  const diff = to.getTime() - d.getTime();
  return Math.max(0, diff / (1000 * 60 * 60));
}

/**
 * Format date for YouTube Analytics API (YYYY-MM-DD)
 */
function formatDateForAPI(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Get time-windowed metrics for a specific video using YouTube Analytics API
 */
export async function getVideoTimeWindowedMetrics(
  config: YouTubeAnalyticsConfig,
  videoId: string,
  publishedAt: string,
  timeWindow: string
): Promise<TimeWindowedMetrics | null> {
  try {
    const publishDate = new Date(publishedAt);
    const windowHours = parseTimeWindow(timeWindow);
    const endDate = new Date(publishDate.getTime() + (windowHours * 60 * 60 * 1000));
    
    // Don't request data beyond current time
    const now = new Date();
    const actualEndDate = endDate > now ? now : endDate;
    
    const startDateStr = formatDateForAPI(publishDate);
    const endDateStr = formatDateForAPI(actualEndDate);
    
    console.log(`[YouTube Analytics] Fetching ${timeWindow} metrics for video ${videoId}: ${startDateStr} to ${endDateStr}`);
    
    // YouTube Analytics API call
    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    url.searchParams.set('ids', `channel==${config.channelId}`);
    url.searchParams.set('startDate', startDateStr);
    url.searchParams.set('endDate', endDateStr);
    url.searchParams.set('metrics', 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained');
    url.searchParams.set('dimensions', 'video');
    url.searchParams.set('filters', `video==${videoId}`);
    url.searchParams.set('sort', '-views');
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[YouTube Analytics] API error: ${response.status} - ${errorText}`);
      console.log(`[YouTube Analytics] Request URL: ${url.toString()}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[YouTube Analytics] Raw response for ${videoId}:`, JSON.stringify(data, null, 2));
    
    const rows = data.rows || [];
    
    if (rows.length === 0) {
      console.log(`[YouTube Analytics] No data found for video ${videoId} in ${timeWindow} window`);
      console.log(`[YouTube Analytics] Response structure:`, data);
      
      // For recent videos, try a smaller time window as fallback
      const videoAgeHours = (new Date().getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
      if (videoAgeHours <= 72 && timeWindow !== '24h') { // If video is less than 3 days old and we haven't tried 24h yet
        console.log(`[YouTube Analytics] Trying fallback 24h window for recent video ${videoId}`);
        return await getVideoTimeWindowedMetrics(config, videoId, publishedAt, '24h');
      }
      
      return null;
    }
    
    // Parse the response (rows[0] contains the metrics)
    const [views, watchTimeMinutes, avgViewDuration, subscribersGained] = rows[0].slice(1); // Skip video ID
    
    return {
      videoId,
      timeWindow,
      views: Number(views) || 0,
      watchTimeMinutes: Number(watchTimeMinutes) || 0,
      averageViewDuration: Number(avgViewDuration) || 0,
      subscribersGained: Number(subscribersGained) || 0,
      confidence: determineConfidence(actualEndDate, endDate),
    };
    
  } catch (error) {
    console.error(`[YouTube Analytics] Error fetching metrics for video ${videoId}:`, error);
    return null;
  }
}

/**
 * Get time-windowed metrics for multiple videos in batch
 */
export async function getBatchTimeWindowedMetrics(
  config: YouTubeAnalyticsConfig,
  videos: Array<{ videoId: string; publishedAt: string }>,
  timeWindow: string
): Promise<TimeWindowedMetrics[]> {
  const results: TimeWindowedMetrics[] = [];
  
  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize);
    const batchPromises = batch.map(video => 
      getVideoTimeWindowedMetrics(config, video.videoId, video.publishedAt, timeWindow)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(Boolean) as TimeWindowedMetrics[]);
    
    // Small delay between batches
    if (i + batchSize < videos.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Parse time window string to hours
 */
function parseTimeWindow(timeWindow: string): number {
  const match = timeWindow.match(/^(\d+)([hdw])$/);
  if (!match) return 24; // default to 24 hours
  
  const [, amount, unit] = match;
  const num = parseInt(amount, 10);
  
  switch (unit) {
    case 'h': return num;
    case 'd': return num * 24;
    case 'w': return num * 24 * 7;
    default: return 24;
  }
}

/**
 * Determine confidence level based on data completeness
 */
function determineConfidence(actualEndDate: Date, requestedEndDate: Date): 'high' | 'medium' | 'low' {
  const completeness = actualEndDate.getTime() / requestedEndDate.getTime();
  
  if (completeness >= 0.95) return 'high';
  if (completeness >= 0.7) return 'medium';
  return 'low';
}

/**
 * Get accurate baseline metrics for comparison videos at the same time window
 */
export async function getAccurateBaselines(
  config: YouTubeAnalyticsConfig,
  currentVideo: { videoId: string; publishedAt: string },
  compareVideos: Array<{ videoId: string; publishedAt: string }>,
  timeWindow?: string
): Promise<{
  current: TimeWindowedMetrics | null;
  baselines: TimeWindowedMetrics[];
  timeWindow: string;
  totalVideosRequested: number;
  successfulVideos: number;
}> {
  // Determine optimal time window based on current video age
  const videoAgeHours = hoursDiff(currentVideo.publishedAt);
  const preferred = timeWindow || getOptimalTimeWindow(videoAgeHours);

  // Build a descending list of candidate windows to maximize odds of a current row
  const candidates: string[] = (() => {
    const list: string[] = [];
    if (preferred === '30d') return ['30d', '7d', '48h', '24h'];
    if (preferred === '7d') return ['7d', '48h', '24h'];
    if (preferred === '48h') return ['48h', '24h'];
    if (preferred === '24h') return ['24h'];
    if (preferred === '12h') return ['12h', '6h', '1h'];
    if (preferred === '6h') return ['6h', '1h'];
    if (preferred === '1h') return ['1h'];
    return [preferred, '24h'];
  })();

  for (const window of candidates) {
    console.log(`[YouTube Analytics] Trying window ${window} for current video`);
    const current = await getVideoTimeWindowedMetrics(
      config,
      currentVideo.videoId,
      currentVideo.publishedAt,
      window
    );
    if (current) {
      const baselines = await getBatchTimeWindowedMetrics(
        config,
        compareVideos,
        window
      );
      console.log(`[YouTube Analytics] Retrieved ${baselines.length}/${compareVideos.length} baseline metrics for ${window} window`);
      return {
        current,
        baselines,
        timeWindow: window,
        totalVideosRequested: compareVideos.length + 1,
        successfulVideos: baselines.length + 1,
      };
    }
  }

  // If none succeeded for current, still report that baselines for the preferred window were fetched
  const baselines = await getBatchTimeWindowedMetrics(
    config,
    compareVideos,
    preferred
  );
  console.log(`[YouTube Analytics] Retrieved ${baselines.length}/${compareVideos.length} baseline metrics for ${preferred} window`);
  return {
    current: null,
    baselines,
    timeWindow: preferred,
    totalVideosRequested: compareVideos.length + 1,
    successfulVideos: baselines.length,
  };
}
