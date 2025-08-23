import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getValidAccessToken } from "@/utils/googleAuth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    
    if (!channelId) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get a valid access token (refreshing if necessary)
    console.log("Getting valid access token for user:", user.id, "channel:", channelId);
    const tokenResult = await getValidAccessToken(user.id, channelId);

    if (!tokenResult.success) {
      console.log("Token validation failed:", tokenResult.error);
      return NextResponse.json({ 
        error: tokenResult.error || "No Google access token found", 
        debug: {
          userId: user.id,
        }
      }, { status: 400 });
    }

    const accessToken = tokenResult.accessToken;

    // Calculate date range for last 90 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    
    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    // Fetch analytics data from YouTube Analytics API
    const metricsParams = new URLSearchParams({
      ids: `channel==${channelId}`,
      startDate: startDateStr,
      endDate: endDateStr,
      metrics: 'views,subscribersGained,subscribersLost,estimatedMinutesWatched,averageViewDuration,comments,likes,dislikes,shares',
      dimensions: '',
    });

    const analyticsResponse = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${metricsParams}`,
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    let analyticsData = null;
    let analyticsError = null;
    
    if (!analyticsResponse.ok) {
      const error = await analyticsResponse.text();
      console.error("YouTube Analytics API failed:", error);
      analyticsError = error;
      
      // Try to parse the error for specific handling
      try {
        const errorData = JSON.parse(error);
        if (errorData.error?.code === 403) {
          analyticsError = "This channel doesn't have YouTube Analytics access enabled or you don't have permission to view its analytics. This can happen with Brand Accounts or channels that haven't enabled analytics.";
        }
      } catch (parseError) {
        // If we can't parse the error, use the raw error
        analyticsError = "Failed to fetch analytics data";
      }
    } else {
      analyticsData = await analyticsResponse.json();
    }

    // Get current subscriber count from the channel data (this should always work)
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}`,
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    let channelData = null;
    if (channelResponse.ok) {
      const channelResult = await channelResponse.json();
      channelData = channelResult.items?.[0];
    }

    // If analytics failed but we have basic channel data, return an error with the channel info
    if (analyticsError) {
      return NextResponse.json({ 
        error: analyticsError,
        isAnalyticsError: true,
        channelInfo: channelData ? {
          title: channelData.snippet?.title || 'Unknown Channel',
          subscriberCount: channelData.statistics?.subscriberCount || 0,
          videoCount: channelData.statistics?.videoCount || 0,
          viewCount: channelData.statistics?.viewCount || 0,
        } : null
      }, { status: 400 });
    }

    // Process the analytics data
    const rows = analyticsData?.rows?.[0] || [];
    const columnHeaders = analyticsData?.columnHeaders || [];
    
    const stats = {
      views: 0,
      subscribersGained: 0,
      subscribersLost: 0,
      netSubscriberChange: 0,
      estimatedMinutesWatched: 0,
      averageViewDuration: 0,
      comments: 0,
      likes: 0,
      dislikes: 0,
      shares: 0,
      currentSubscribers: channelData?.statistics?.subscriberCount || 0,
      totalVideos: channelData?.statistics?.videoCount || 0,
      totalViews: channelData?.statistics?.viewCount || 0,
      channelTitle: channelData?.snippet?.title || 'Unknown Channel',
    };

    // Map the data from the response
    columnHeaders.forEach((header: { name: string }, index: number) => {
      const value = rows[index] || 0;
      switch (header.name) {
        case 'views':
          stats.views = value;
          break;
        case 'subscribersGained':
          stats.subscribersGained = value;
          break;
        case 'subscribersLost':
          stats.subscribersLost = value;
          break;
        case 'estimatedMinutesWatched':
          stats.estimatedMinutesWatched = value;
          break;
        case 'averageViewDuration':
          stats.averageViewDuration = value;
          break;
        case 'comments':
          stats.comments = value;
          break;
        case 'likes':
          stats.likes = value;
          break;
        case 'dislikes':
          stats.dislikes = value;
          break;
        case 'shares':
          stats.shares = value;
          break;
      }
    });

    stats.netSubscriberChange = stats.subscribersGained - stats.subscribersLost;

    return NextResponse.json({ 
      stats,
      dateRange: {
        startDate: startDateStr,
        endDate: endDateStr
      }
    });

  } catch (error) {
    console.error("YouTube stats error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
