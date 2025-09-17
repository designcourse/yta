import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";

async function fetchChannelBasic(channelId: string, accessToken: string) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`channels.list failed ${res.status} ${t}`);
  }
  const json = await res.json();
  const item = Array.isArray(json?.items) ? json.items[0] : null;
  if (!item) return null;
  return {
    id: String(item.id || ""),
    title: String(item?.snippet?.title || ""),
    thumbnails: item?.snippet?.thumbnails || null,
    stats: {
      subscribers: Number(item?.statistics?.subscriberCount || 0),
      videos: Number(item?.statistics?.videoCount || 0),
      views: Number(item?.statistics?.viewCount || 0),
    },
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data, error } = await supabase
      .from("competitors")
      .select("id, competitor_channel_id, competitor_title, metadata, created_at")
      .eq("user_id", user.id)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ competitors: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { channelId, competitorChannelId } = body || {};
    if (!channelId || !competitorChannelId) {
      return NextResponse.json({ error: "channelId and competitorChannelId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Limit to 5 competitors per channel
    const { data: existing } = await supabase
      .from("competitors")
      .select("id")
      .eq("user_id", user.id)
      .eq("channel_id", channelId);
    if (Array.isArray(existing) && existing.length >= 5) {
      return NextResponse.json({ error: "Maximum of 5 competitors reached" }, { status: 400 });
    }

    // Fetch public stats for competitor for display
    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) return NextResponse.json({ error: token.error || "No YouTube access" }, { status: 400 });
    const basic = await fetchChannelBasic(competitorChannelId, token.accessToken).catch(() => null);

    const insert = {
      user_id: user.id,
      channel_id: channelId,
      competitor_channel_id: competitorChannelId,
      competitor_title: basic?.title || null,
      metadata: basic ? { thumbnails: basic.thumbnails, stats: basic.stats } : null,
    };

    const { data, error } = await supabase
      .from("competitors")
      .insert(insert)
      .select("id, competitor_channel_id, competitor_title, metadata, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ competitor: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const competitorChannelId = searchParams.get("competitorChannelId");
    if (!channelId || !competitorChannelId) {
      return NextResponse.json({ error: "channelId and competitorChannelId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { error } = await supabase
      .from("competitors")
      .delete()
      .eq("user_id", user.id)
      .eq("channel_id", channelId)
      .eq("competitor_channel_id", competitorChannelId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


