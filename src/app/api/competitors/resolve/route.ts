import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";

function extractChannelId(input: string): string | null {
  if (!input) return null;
  // If already looks like a channel ID
  if (/^UC[0-9A-Za-z_-]{22}$/.test(input)) return input;
  // Try to parse URL patterns
  try {
    const url = new URL(input);
    // /channel/UC*
    const m = url.pathname.match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
    if (m) return m[1];
    // handle @handle by returning null; we'll resolve via search.list
  } catch {}
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const q = searchParams.get("q");
    if (!channelId || !q) return NextResponse.json({ error: "channelId and q required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) return NextResponse.json({ error: token.error || "No YouTube access" }, { status: 400 });

    const directId = extractChannelId(q);
    if (directId) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(directId)}`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      if (res.ok) {
        const json = await res.json();
        const item = Array.isArray(json?.items) ? json.items[0] : null;
        if (item) {
          return NextResponse.json({
            results: [
              {
                id: String(item.id || ""),
                title: String(item?.snippet?.title || ""),
                thumbnails: item?.snippet?.thumbnails || null,
                stats: {
                  subscribers: Number(item?.statistics?.subscriberCount || 0),
                  videos: Number(item?.statistics?.videoCount || 0),
                  views: Number(item?.statistics?.viewCount || 0),
                },
              },
            ],
          });
        }
      }
    }

    // Fallback to search by query or @handle
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(q)}&maxResults=5`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    if (!searchRes.ok) {
      const t = await searchRes.text().catch(() => "");
      return NextResponse.json({ error: `search.list failed ${t}` }, { status: 500 });
    }
    const sjson = await searchRes.json();
    const items: any[] = Array.isArray(sjson?.items) ? sjson.items : [];
    const results = items.map((it: any) => ({
      id: String(it?.id?.channelId || ""),
      title: String(it?.snippet?.title || ""),
      thumbnails: it?.snippet?.thumbnails || null,
    })).filter((r: any) => r.id);

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


