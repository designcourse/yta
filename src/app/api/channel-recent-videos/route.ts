import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";

// Simple per-process TTL cache to reduce API calls during dev/runtime
const recentVideosCache = new Map<string, { expiresAt: number; payload: any }>();
const RECENT_VIDEOS_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const cacheKey = `${user.id}:${channelId}`;
    const cached = recentVideosCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ videos: cached.payload, fromCache: true });
    }

    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) return NextResponse.json({ error: token.error || 'No YouTube access' }, { status: 400 });

    // Resolve uploads playlist, then fetch recent items cheaply
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    if (!channelRes.ok) {
      const t = await channelRes.text();
      return NextResponse.json({ error: 'channels.list failed', details: t }, { status: 500 });
    }
    const channelJson = await channelRes.json();
    const uploadsPlaylistId = channelJson?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return NextResponse.json({ videos: [] });

    const playlistRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    if (!playlistRes.ok) {
      const t = await playlistRes.text();
      return NextResponse.json({ error: 'playlistItems.list failed', details: t }, { status: 500 });
    }
    const playlistJson = await playlistRes.json();
    const ids: string[] = (playlistJson.items || []).map((it: any) => it.contentDetails?.videoId).filter(Boolean);
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

    recentVideosCache.set(cacheKey, { expiresAt: Date.now() + RECENT_VIDEOS_TTL_MS, payload: videos });
    return NextResponse.json({ videos, fromCache: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


