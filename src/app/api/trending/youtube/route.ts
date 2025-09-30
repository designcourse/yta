import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

// YouTube Data API key for public searches (no OAuth needed)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

// Rate limiting: 10 searches per 30 minutes per user
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string, isAdmin: boolean): { allowed: boolean; error?: string } {
  if (isAdmin) return { allowed: true }; // Admins bypass rate limit

  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    // Reset or create new limit
    rateLimitMap.set(userId, { count: 1, resetTime: now + 30 * 60 * 1000 }); // 30 minutes
    return { allowed: true };
  }

  if (userLimit.count >= 10) {
    const remainingMinutes = Math.ceil((userLimit.resetTime - now) / 60000);
    return { 
      allowed: false, 
      error: `Rate limit exceeded. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.` 
    };
  }

  userLimit.count++;
  return { allowed: true };
}

function getTimeFilterDate(timeFilter: string): Date {
  const now = new Date();
  switch (timeFilter) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '2d':
      return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    case '3d':
      return new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    case '5d':
      return new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    case '1w':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '2w':
      return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    case '1m':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
  }
}

interface TrendingVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnails: {
    default: { url: string };
    medium: { url: string };
    high: { url: string };
  };
  viewCount: string;
  likeCount: string;
  commentCount: string;
  tags?: string[];
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const channelId = searchParams.get('channelId');
    const regionCode = searchParams.get('regionCode') || 'US';
    const maxResults = parseInt(searchParams.get('maxResults') || '25');
    const searchQuery = searchParams.get('query') || '';
    const timeFilter = searchParams.get('timeFilter') || '24h';
    const isAdmin = searchParams.get('isAdmin') === 'true';

    if (!channelId) {
      return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
    }

    // Check rate limit
    const rateLimitCheck = checkRateLimit(user.id, isAdmin);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json({ error: rateLimitCheck.error }, { status: 429 });
    }

    if (!YOUTUBE_API_KEY) {
      return NextResponse.json({ 
        error: 'YouTube API key not configured',
        details: 'Please add YOUTUBE_API_KEY to your environment variables'
      }, { status: 500 });
    }

    // Get user's most popular bucket to determine niche
    const { data: bucketsData } = await supabase
      .from('content_buckets')
      .select('*, video_metrics(views)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false });

    let searchTerms = searchQuery;
    
    // If no explicit query, use the most popular bucket's theme
    if (!searchQuery && bucketsData && bucketsData.length > 0) {
      const bucketWithViews = bucketsData.map(bucket => ({
        ...bucket,
        totalViews: bucket.video_metrics?.reduce((sum: number, m: any) => sum + (m.views || 0), 0) || 0
      }));
      
      const topBucket = bucketWithViews.sort((a, b) => b.totalViews - a.totalViews)[0];
      searchTerms = topBucket?.label || 'technology trends';
    }

    let trendingVideos: TrendingVideo[] = [];

    if (searchTerms) {
      // Use search endpoint with relevance and recency
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('q', searchTerms);
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('order', 'viewCount');
      searchUrl.searchParams.set('publishedAfter', getTimeFilterDate(timeFilter).toISOString());
      searchUrl.searchParams.set('maxResults', maxResults.toString());
      searchUrl.searchParams.set('regionCode', regionCode);
      searchUrl.searchParams.set('relevanceLanguage', 'en');
      searchUrl.searchParams.set('videoDuration', 'medium'); // 4-20 minutes
      searchUrl.searchParams.set('key', YOUTUBE_API_KEY);

      const searchResponse = await fetch(searchUrl.toString());

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error('YouTube search error:', errorText);
        return NextResponse.json({ 
          error: 'YouTube API error', 
          details: errorText 
        }, { status: searchResponse.status });
      }

      const searchData = await searchResponse.json();
      const videoIds = searchData.items?.map((item: any) => item.id.videoId).filter(Boolean) || [];

      if (videoIds.length > 0) {
        // Get full video details including statistics
        const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        videosUrl.searchParams.set('part', 'snippet,statistics,contentDetails');
        videosUrl.searchParams.set('id', videoIds.join(','));
        videosUrl.searchParams.set('key', YOUTUBE_API_KEY);

        const videosResponse = await fetch(videosUrl.toString());

        if (videosResponse.ok) {
          const videosData = await videosResponse.json();
          
          trendingVideos = videosData.items?.map((item: any) => ({
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            channelTitle: item.snippet.channelTitle,
            channelId: item.snippet.channelId,
            publishedAt: item.snippet.publishedAt,
            thumbnails: item.snippet.thumbnails,
            viewCount: item.statistics?.viewCount || '0',
            likeCount: item.statistics?.likeCount || '0',
            commentCount: item.statistics?.commentCount || '0',
            tags: item.snippet.tags || []
          })) || [];
        }
      }
    }

    // Sort by view count (highest first)
    const sortedVideos = trendingVideos.sort((a, b) => {
      const viewsA = parseInt(a.viewCount) || 0;
      const viewsB = parseInt(b.viewCount) || 0;
      return viewsB - viewsA;
    });

    return NextResponse.json({ 
      videos: sortedVideos,
      searchTerms,
      count: sortedVideos.length
    });

  } catch (error) {
    console.error('Error fetching trending videos:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
