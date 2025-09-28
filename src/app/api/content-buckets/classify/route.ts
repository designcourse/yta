import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { classifyChannelVideos, VideoForClustering } from '@/utils/bucket-classifier';
import { getValidAccessToken } from '@/utils/googleAuth';

/**
 * Manually trigger bucket classification for an existing channel
 * Useful for testing or re-classifying channels
 */
export async function POST(request: Request) {
  try {
    const { channelId } = await request.json();

    if (!channelId) {
      return NextResponse.json({ error: 'Channel ID is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get access token for YouTube API
    const tokenResult = await getValidAccessToken(user.id, channelId);
    if (!tokenResult.success || !tokenResult.accessToken) {
      return NextResponse.json({ error: 'Unable to access YouTube API' }, { status: 400 });
    }

    // Get existing videos from video_metrics
    const admin = createSupabaseAdminClient();
    const { data: videoMetrics, error: metricsError } = await admin
      .from('video_metrics')
      .select('video_id, published_at, length_sec')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .order('published_at', { ascending: false })
      .limit(40);

    if (metricsError) {
      throw new Error(`Failed to fetch video metrics: ${metricsError.message}`);
    }

    if (!videoMetrics || videoMetrics.length === 0) {
      return NextResponse.json({ error: 'No videos found for this channel' }, { status: 404 });
    }

    // Fetch video details from YouTube API
    const videoIds = videoMetrics.map(v => v.video_id).filter(Boolean);
    const videosForClustering: VideoForClustering[] = [];

    // Process in batches of 45 (YouTube API limit)
    for (let i = 0; i < videoIds.length; i += 45) {
      const batch = videoIds.slice(i, i + 45);
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('id', batch.join(','));

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      for (const item of items) {
        const videoId = item?.id;
        const snippet = item?.snippet || {};
        const metric = videoMetrics.find(v => v.video_id === videoId);

        if (videoId && metric) {
          videosForClustering.push({
            id: videoId,
            title: snippet.title || '',
            description: snippet.description || '',
            publishedAt: metric.published_at,
            durationSec: metric.length_sec,
          });
        }
      }
    }

    if (videosForClustering.length === 0) {
      return NextResponse.json({ error: 'No valid videos found for classification' }, { status: 404 });
    }

    // Classify videos into buckets
    const { buckets, assignments } = await classifyChannelVideos(
      user.id,
      channelId,
      videosForClustering
    );

    return NextResponse.json({
      success: true,
      bucketsCreated: buckets.length,
      videosAssigned: assignments.length,
      buckets: buckets.map(b => ({
        id: b.id,
        key: b.bucket_key,
        label: b.label,
        description: b.description,
      })),
    });

  } catch (error) {
    console.error('Error in manual bucket classification:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal error' 
    }, { status: 500 });
  }
}
