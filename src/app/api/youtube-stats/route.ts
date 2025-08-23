import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

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

    // Get the user's Google access token from our database
    const admin = createSupabaseAdminClient();
    const { data: googleAccount, error: accountError } = await admin
      .from("google_accounts")
      .select("access_token, refresh_token")
      .eq("user_id", user.id)
      .single();

    console.log("User ID:", user.id);
    console.log("Google account query error:", accountError);
    console.log("Google account found:", !!googleAccount);
    console.log("Has access token:", !!googleAccount?.access_token);

    if (!googleAccount?.access_token) {
      return NextResponse.json({ 
        error: "No Google access token found", 
        debug: {
          userId: user.id,
          accountFound: !!googleAccount,
          accountError: accountError?.message
        }
      }, { status: 400 });
    }

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
          Authorization: `Bearer ${googleAccount.access_token}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    if (!analyticsResponse.ok) {
      const error = await analyticsResponse.text();
      console.error("YouTube Analytics API failed:", error);
      return NextResponse.json({ error: "Failed to fetch analytics data" }, { status: 400 });
    }

    const analyticsData = await analyticsResponse.json();

    // Also get current subscriber count from the channel data
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}`,
      { 
        headers: { 
          Authorization: `Bearer ${googleAccount.access_token}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    let channelData = null;
    if (channelResponse.ok) {
      const channelResult = await channelResponse.json();
      channelData = channelResult.items?.[0];
    }

    // Process the analytics data
    const rows = analyticsData.rows?.[0] || [];
    const columnHeaders = analyticsData.columnHeaders || [];
    
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
