import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) return NextResponse.json({ items: [] });

    const token = await getValidAccessToken(user.id);
    if (!token.success) return NextResponse.json({ error: token.error || "No YouTube access" }, { status: 400 });

    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(ids.join(","))}&fields=items(id,snippet(title,thumbnails,publishedAt),contentDetails(duration))`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    if (!videosRes.ok) {
      const t = await videosRes.text();
      return NextResponse.json({ error: "videos.list failed", details: t }, { status: 500 });
    }
    const json = await videosRes.json();
    const items = (json?.items || []).map((it: any) => ({
      id: it?.id,
      title: it?.snippet?.title || "",
      thumb: it?.snippet?.thumbnails?.medium?.url || it?.snippet?.thumbnails?.default?.url || "",
      publishedAt: it?.snippet?.publishedAt || "",
      duration: it?.contentDetails?.duration || "",
    }));
    return NextResponse.json({ items });
  } catch (e) {
    console.error("/api/collection/losers error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


