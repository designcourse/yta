import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

/**
 * GET /api/video-stats
 * Fetch stats for a specific video by title or video_id
 * Query params: channelId, title (optional), videoId (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const title = searchParams.get('title');
    const videoId = searchParams.get('videoId');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    if (!title && !videoId) {
      return NextResponse.json({ error: 'Either title or videoId is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    // First, try to find the video in video_metrics (has all historical data)
    let videoQuery = admin
      .from('video_metrics')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel_id', channelId);

    if (videoId) {
      videoQuery = videoQuery.eq('video_id', videoId);
    } else if (title) {
      // Case-insensitive partial match on title
      videoQuery = videoQuery.ilike('video_title', `%${title}%`);
    }

    const { data: metricsVideos, error: metricsError } = await videoQuery;

    if (metricsError) {
      console.error('[VideoStats] Metrics query error:', metricsError);
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
    }

    if (!metricsVideos || metricsVideos.length === 0) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const video = metricsVideos[0];

    // Get bucket info if available
    let bucketLabel = null;
    if (video.bucket_id) {
      const { data: bucketData } = await admin
        .from('content_buckets')
        .select('label')
        .eq('id', video.bucket_id)
        .maybeSingle();

      if (bucketData) {
        bucketLabel = bucketData.label;
      }
    }

    const response = {
      video_id: video.video_id,
      title: video.video_title || 'Untitled',
      published_at: video.published_at,
      view_count: video.views,
      metrics: {
        avg_view_duration_sec: video.avg_view_duration_sec,
        views_per_day: video.views_per_day,
        avg_view_pct: video.avg_view_pct,
        ctr: video.ctr,
        likes: video.likes,
        subscribers_gained: video.subscribers_gained,
      },
      content_bucket: bucketLabel,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[VideoStats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video stats' },
      { status: 500 }
    );
  }
}

