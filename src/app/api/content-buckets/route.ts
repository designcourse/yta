import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getChannelBuckets } from '@/utils/bucket-classifier';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    if (!channelId) {
      return NextResponse.json({ error: 'Channel ID is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const buckets = await getChannelBuckets(user.id, channelId);

    return NextResponse.json({ buckets });
  } catch (error) {
    console.error('Error fetching content buckets:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { channelId, bucketKey, label, description } = await request.json();

    if (!channelId || !bucketKey || !label) {
      return NextResponse.json({ error: 'channelId, bucketKey, and label are required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: bucket, error } = await admin
      .from('content_buckets')
      .insert({
        user_id: user.id,
        channel_id: channelId,
        bucket_key: bucketKey,
        label,
        description: description || null,
      })
      .select('id, bucket_key, label, description')
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ error: 'Bucket key already exists for this channel' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ bucket });
  } catch (error) {
    console.error('Error creating content bucket:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { bucketId, label, description } = await request.json();

    if (!bucketId || !label) {
      return NextResponse.json({ error: 'bucketId and label are required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: bucket, error } = await admin
      .from('content_buckets')
      .update({
        label,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bucketId)
      .eq('user_id', user.id)
      .select('id, bucket_key, label, description')
      .single();

    if (error) {
      throw error;
    }

    if (!bucket) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
    }

    return NextResponse.json({ bucket });
  } catch (error) {
    console.error('Error updating content bucket:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bucketId = searchParams.get('bucketId');

    if (!bucketId) {
      return NextResponse.json({ error: 'Bucket ID is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    
    // First, unassign all videos from this bucket
    await admin
      .from('video_metrics')
      .update({ bucket_id: null })
      .eq('bucket_id', bucketId);

    // Then delete the bucket
    const { error } = await admin
      .from('content_buckets')
      .delete()
      .eq('id', bucketId)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting content bucket:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
