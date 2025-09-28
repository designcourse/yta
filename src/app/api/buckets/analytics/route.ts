import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

interface BucketAnalytics {
  id: string;
  key: string;
  label: string;
  description: string;
  videoCount: number;
  totalViews: number;
  averageViews: number;
  medianViews: number;
  successScore: number;
  topVideo: {
    videoId: string;
    views: number;
  } | null;
  recentVideos: number; // Videos from last 30 days
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    // Get all buckets for the channel
    const { data: buckets, error: bucketsError } = await admin
      .from('content_buckets')
      .select('id, bucket_key, label, description')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (bucketsError) {
      console.error('Error fetching buckets:', bucketsError);
      return NextResponse.json({ error: 'Failed to fetch buckets' }, { status: 500 });
    }

    if (!buckets || buckets.length === 0) {
      return NextResponse.json({ buckets: [] });
    }

    // Get video metrics for all videos in these buckets
    const { data: videoMetrics, error: metricsError } = await admin
      .from('video_metrics')
      .select('video_id, bucket_id, views, published_at')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .not('bucket_id', 'is', null)
      .order('published_at', { ascending: false });

    if (metricsError) {
      console.error('Error fetching video metrics:', metricsError);
      return NextResponse.json({ error: 'Failed to fetch video metrics' }, { status: 500 });
    }

    // First pass: calculate raw metrics for each bucket
    const bucketsWithRawMetrics = buckets.map(bucket => {
      const bucketVideos = videoMetrics?.filter(v => v.bucket_id === bucket.id) || [];
      const views = bucketVideos.map(v => v.views || 0).filter(v => v > 0);
      
      // Calculate 30-day recency
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentVideos = bucketVideos.filter(v => 
        new Date(v.published_at) >= thirtyDaysAgo
      ).length;

      // Find top performing video
      const topVideo = bucketVideos.reduce((top, video) => {
        const videoViews = video.views || 0;
        if (!top || videoViews > (top.views || 0)) {
          return { videoId: video.video_id, views: videoViews };
        }
        return top;
      }, null as { videoId: string; views: number } | null);

      // Calculate basic metrics
      const totalViews = views.reduce((sum, v) => sum + v, 0);
      const averageViews = views.length > 0 ? totalViews / views.length : 0;
      
      // Calculate median views (more robust against outliers)
      const sortedViews = [...views].sort((a, b) => a - b);
      const medianViews = sortedViews.length > 0 
        ? sortedViews.length % 2 === 0
          ? (sortedViews[sortedViews.length / 2 - 1] + sortedViews[sortedViews.length / 2]) / 2
          : sortedViews[Math.floor(sortedViews.length / 2)]
        : 0;

      // Calculate raw performance metrics
      const rawMetrics = calculateRawMetrics(views, recentVideos, bucketVideos.length);

      return {
        id: bucket.id,
        key: bucket.bucket_key,
        label: bucket.label,
        description: bucket.description || '',
        videoCount: bucketVideos.length,
        totalViews,
        averageViews: Math.round(averageViews),
        medianViews: Math.round(medianViews),
        rawScore: rawMetrics.rawScore,
        topVideo,
        recentVideos,
      };
    });

    // Second pass: calculate relative success scores
    const maxRawScore = Math.max(...bucketsWithRawMetrics.map(b => b.rawScore), 1); // Avoid division by zero
    const minRawScore = Math.min(...bucketsWithRawMetrics.map(b => b.rawScore));
    
    const bucketAnalytics: BucketAnalytics[] = bucketsWithRawMetrics.map(bucket => {
      let successScore: number;
      
      if (maxRawScore === minRawScore) {
        // All buckets perform equally, give them all a decent score
        successScore = bucket.rawScore > 0 ? 75 : 0;
      } else {
        // Scale relative to the best performer (top bucket gets 85-100, others scale down)
        const relativeScore = (bucket.rawScore - minRawScore) / (maxRawScore - minRawScore);
        successScore = Math.round(15 + (relativeScore * 85)); // Scale from 15-100
      }

      return {
        id: bucket.id,
        key: bucket.key,
        label: bucket.label,
        description: bucket.description,
        videoCount: bucket.videoCount,
        totalViews: bucket.totalViews,
        averageViews: bucket.averageViews,
        medianViews: bucket.medianViews,
        successScore,
        topVideo: bucket.topVideo,
        recentVideos: bucket.recentVideos,
      };
    });

    // Sort by success score (highest first)
    bucketAnalytics.sort((a, b) => b.successScore - a.successScore);

    return NextResponse.json({ 
      buckets: bucketAnalytics,
      totalVideos: videoMetrics?.length || 0,
      totalBuckets: buckets.length,
    });

  } catch (error) {
    console.error('Bucket analytics error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Calculate raw performance metrics for a bucket (before relative scoring)
 */
function calculateRawMetrics(views: number[], recentVideos: number, totalVideos: number) {
  if (views.length === 0) return { rawScore: 0, median: 0, consistency: 0, recency: 0, sampleSize: 0 };

  // Base score from median views (more robust than average)
  const sortedViews = [...views].sort((a, b) => a - b);
  const median = sortedViews.length % 2 === 0
    ? (sortedViews[sortedViews.length / 2 - 1] + sortedViews[sortedViews.length / 2]) / 2
    : sortedViews[Math.floor(sortedViews.length / 2)];

  // Consistency factor: lower standard deviation = more consistent performance
  const mean = views.reduce((sum, v) => sum + v, 0) / views.length;
  const variance = views.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / views.length;
  const stdDev = Math.sqrt(variance);
  const consistency = mean > 0 ? Math.max(0, 1 - (stdDev / mean)) : 0;

  // Sample size factor: more videos = more reliable data
  const sampleSize = Math.min(1, totalVideos / 10); // Cap at 10 videos for full confidence

  // Recency factor: recent activity is good
  const recency = totalVideos > 0 ? Math.min(1, recentVideos / Math.max(1, totalVideos * 0.3)) : 0;

  // Combine factors with weights (median is primary factor)
  const rawScore = median * (1 + consistency * 0.2 + sampleSize * 0.1 + recency * 0.1);

  return { rawScore, median, consistency, recency, sampleSize };
}
