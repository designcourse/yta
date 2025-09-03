import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getS3Client, getBucketName } from "@/utils/s3";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId"); // external id
    if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: ch } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ch) return NextResponse.json({ photos: [] });

    const { data: photos, error } = await supabase
      .from("reference_photos")
      .select("id, file_key, url, content_type, width, height, size_bytes, created_at")
      .eq("user_id", user.id)
      .eq("channel_id", ch.id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Failed to load" }, { status: 500 });

    return NextResponse.json({ photos: photos || [] });
  } catch (e) {
    console.error("reference-photos GET error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelId, items } = body as { channelId: string; items: Array<{ key: string; url?: string; contentType?: string; size?: number; width?: number; height?: number; }>; };
    if (!channelId || !Array.isArray(items)) return NextResponse.json({ error: "channelId and items required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: ch } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ch) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const rows = items.map((it) => ({
      user_id: user.id,
      channel_id: ch.id,
      file_key: it.key,
      url: it.url,
      content_type: it.contentType,
      width: it.width,
      height: it.height,
      size_bytes: it.size ?? null,
    }));

    const admin = createSupabaseAdminClient();
    const { data: inserted, error } = await admin
      .from("reference_photos")
      .insert(rows)
      .select("id, file_key, url, content_type, width, height, size_bytes, created_at")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Failed to save" }, { status: 500 });

    return NextResponse.json({ photos: inserted || [] });
  } catch (e) {
    console.error("reference-photos POST error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: row } = await supabase
      .from('reference_photos')
      .select('id, file_key, channel_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const s3 = getS3Client();
    const Bucket = getBucketName();
    try {
      await s3.deleteObject({ Bucket, Key: row.file_key } as any);
    } catch {}

    const admin = createSupabaseAdminClient();
    await admin.from('reference_photos').delete().eq('id', row.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('reference-photos DELETE error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


