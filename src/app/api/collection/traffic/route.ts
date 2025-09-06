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
    const channelId: string | undefined = body?.channelId;
    if (!channelId || ids.length === 0) return NextResponse.json({ error: "channelId and ids required" }, { status: 400 });

    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) return NextResponse.json({ error: token.error || "No YouTube access" }, { status: 400 });

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const analyticsParams = new URLSearchParams({
      ids: `channel==${channelId}`,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions: "trafficSourceType",
      filters: `video==${ids.join(",")}`,
      metrics: "views,impressions,impressionsCtr,averageViewDuration,averageViewPercentage",
    });

    const analyticsRes = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${analyticsParams.toString()}`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    if (!analyticsRes.ok) {
      const t = await analyticsRes.text();
      return NextResponse.json({ error: "analytics.reports failed", details: t }, { status: 500 });
    }
    const json = await analyticsRes.json();
    const rows: any[] = Array.isArray(json?.rows) ? json.rows : [];
    const agg: Record<string, number> = {};
    for (const r of rows) {
      const source = String(r[0] ?? "");
      const views = Number(r[1] ?? 0);
      agg[source] = (agg[source] || 0) + views;
    }
    const mapKey = (k: string) => {
      const key = k.toLowerCase();
      if (key.includes("browse")) return "browse";
      if (key.includes("suggested") || key.includes("related")) return "suggested";
      if (key.includes("search")) return "search";
      return "other";
    };
    const result: Record<string, number> = { browse: 0, suggested: 0, search: 0, other: 0 };
    for (const [k, v] of Object.entries(agg)) {
      result[mapKey(k)] += v as number;
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("/api/collection/traffic error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


