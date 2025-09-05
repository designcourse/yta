import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) return NextResponse.json({ error: token.error || 'No YouTube access' }, { status: 400 });

    // Get last 10 video ids by publish date
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    if (!searchRes.ok) {
      const t = await searchRes.text();
      return NextResponse.json({ error: 'search failed', details: t }, { status: 500 });
    }
    const searchJson = await searchRes.json();
    const ids: string[] = (searchJson.items || []).map((it: any) => it.id?.videoId).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ videos: [] });

    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    if (!videosRes.ok) {
      const t = await videosRes.text();
      return NextResponse.json({ error: 'videos.list failed', details: t }, { status: 500 });
    }
    const vjson = await videosRes.json();
    const videos = (vjson.items || []).map((v: any) => ({
      id: v.id,
      title: v.snippet?.title,
      thumbnails: v.snippet?.thumbnails,
      publishedAt: v.snippet?.publishedAt,
      viewCount: Number(v.statistics?.viewCount || 0),
      commentCount: Number(v.statistics?.commentCount || 0),
      duration: v.contentDetails?.duration,
    }));

    return NextResponse.json({ videos });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


