import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getS3Client, getBucketName } from "@/utils/s3";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const planId = searchParams.get('planId');

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Resolve channel internal id
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });
    const { data: ch } = await supabase
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    const q = supabase
      .from('video_thumbnails')
      .select('id, file_key, url, video_plan_id')
      .eq('user_id', user.id)
      .eq('channel_id', ch.id)
      .order('created_at', { ascending: false });
    if (planId) (q as any).eq('video_plan_id', planId);
    const { data: rows } = await (q as any);
    return NextResponse.json({ thumbnails: rows || [] });
  } catch (e) {
    console.error('video-thumbnails GET error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelId, planId, fileKey, url } = body as { channelId: string; planId: string; fileKey: string; url?: string };
    if (!channelId || !planId || !fileKey) return NextResponse.json({ error: 'channelId, planId, fileKey required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: ch } = await supabase
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    // Enforce at most 10 per video plan
    const { count } = await supabase
      .from('video_thumbnails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('channel_id', ch.id)
      .eq('video_plan_id', planId);
    if ((count || 0) >= 10) return NextResponse.json({ error: 'Max 10 thumbnails per video' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: inserted, error } = await admin
      .from('video_thumbnails')
      .insert({ user_id: user.id, channel_id: ch.id, video_plan_id: planId, file_key: fileKey, url })
      .select('id, file_key, url')
      .single();
    if (error) return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    return NextResponse.json({ thumbnail: inserted });
  } catch (e) {
    console.error('video-thumbnails POST error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
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
      .from('video_thumbnails')
      .select('id, file_key')
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
    await admin.from('video_thumbnails').delete().eq('id', row.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('video-thumbnails DELETE error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


