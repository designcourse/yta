import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { generateTopicClustersWithGemini, VideoForClustering } from '@/utils/topic-cluster-analyzer';

export type ContentBucket = {
  id: string;
  bucket_key: string;
  label: string;
  description: string | null;
};

export type BucketAssignment = {
  videoId: string;
  bucketId: string;
  confidence: number;
};

/**
 * Classify videos into content buckets for a channel during onboarding
 */
export async function classifyChannelVideos(
  userId: string,
  channelId: string,
  videos: VideoForClustering[]
): Promise<{ buckets: ContentBucket[]; assignments: BucketAssignment[] }> {
  if (videos.length === 0) {
    return { buckets: [], assignments: [] };
  }

  // Use existing Gemini classifier
  const geminiResult = await generateTopicClustersWithGemini(videos);
  const admin = createSupabaseAdminClient();

  // Insert buckets into database
  const bucketInserts = geminiResult.data.buckets.map((bucket) => ({
    user_id: userId,
    channel_id: channelId,
    bucket_key: bucket.key,
    label: bucket.label,
    description: bucket.description || null,
  }));

  const { data: insertedBuckets, error: bucketError } = await admin
    .from('content_buckets')
    .upsert(bucketInserts, { onConflict: 'channel_id,bucket_key' })
    .select('id, bucket_key, label, description');

  if (bucketError) {
    throw new Error(`Failed to insert buckets: ${bucketError.message}`);
  }

  // Create bucket key to ID mapping
  const bucketKeyToId = new Map(
    insertedBuckets.map((bucket) => [bucket.bucket_key, bucket.id])
  );

  // Update video_metrics with bucket assignments
  const assignments: BucketAssignment[] = [];
  for (const assignment of geminiResult.data.assignments) {
    const bucketId = bucketKeyToId.get(assignment.bucketKey);
    if (bucketId) {
      assignments.push({
        videoId: assignment.videoId,
        bucketId,
        confidence: assignment.confidence || 0.5,
      });

      // Update video_metrics table
      await admin
        .from('video_metrics')
        .update({ bucket_id: bucketId })
        .eq('user_id', userId)
        .eq('channel_id', channelId)
        .eq('video_id', assignment.videoId);
    }
  }

  return {
    buckets: insertedBuckets.map((b) => ({
      id: b.id,
      bucket_key: b.bucket_key,
      label: b.label,
      description: b.description,
    })),
    assignments,
  };
}

/**
 * Assign a single new video to the most appropriate existing bucket
 */
export async function assignVideoToBucket(
  userId: string,
  channelId: string,
  video: VideoForClustering
): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  // Get existing buckets for this channel
  const { data: existingBuckets, error: bucketError } = await admin
    .from('content_buckets')
    .select('id, bucket_key, label, description')
    .eq('user_id', userId)
    .eq('channel_id', channelId);

  if (bucketError || !existingBuckets || existingBuckets.length === 0) {
    console.warn(`No existing buckets found for channel ${channelId}`);
    return null;
  }

  // If only one bucket exists, assign to it
  if (existingBuckets.length === 1) {
    const bucketId = existingBuckets[0].id;
    await admin
      .from('video_metrics')
      .update({ bucket_id: bucketId })
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .eq('video_id', video.id);
    return bucketId;
  }

  // Use Gemini to classify this single video against existing buckets
  try {
    const bucketDescriptions = existingBuckets
      .map((b) => `${b.bucket_key}: ${b.label} - ${b.description || 'No description'}`)
      .join('\n');

    const prompt = `Classify this YouTube video into one of the existing content buckets.

Video:
Title: ${video.title}
Description: ${video.description.slice(0, 200)}

Existing Buckets:
${bucketDescriptions}

Return only the bucket_key that best matches this video. If none match well, return "new_bucket".`;

    // Simple classification using existing Gemini setup
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 100 },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const bucketKey = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (bucketKey === 'new_bucket') {
      // Create a new bucket for this video type
      const newBucketKey = `bucket_${Date.now()}`;
      const { data: newBucket, error: insertError } = await admin
        .from('content_buckets')
        .insert({
          user_id: userId,
          channel_id: channelId,
          bucket_key: newBucketKey,
          label: `New Content Type`,
          description: `Auto-created for: ${video.title.slice(0, 50)}...`,
        })
        .select('id')
        .single();

      if (insertError || !newBucket) {
        console.error('Failed to create new bucket:', insertError);
        return existingBuckets[0].id; // Fallback to first bucket
      }

      await admin
        .from('video_metrics')
        .update({ bucket_id: newBucket.id })
        .eq('user_id', userId)
        .eq('channel_id', channelId)
        .eq('video_id', video.id);

      return newBucket.id;
    }

    // Find matching bucket
    const matchingBucket = existingBuckets.find((b) => b.bucket_key === bucketKey);
    const bucketId = matchingBucket?.id || existingBuckets[0].id;

    await admin
      .from('video_metrics')
      .update({ bucket_id: bucketId })
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .eq('video_id', video.id);

    return bucketId;
  } catch (error) {
    console.error('Error in video bucket assignment:', error);
    // Fallback to first bucket
    const bucketId = existingBuckets[0].id;
    await admin
      .from('video_metrics')
      .update({ bucket_id: bucketId })
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .eq('video_id', video.id);
    return bucketId;
  }
}

/**
 * Get all buckets for a channel
 */
export async function getChannelBuckets(
  userId: string,
  channelId: string
): Promise<ContentBucket[]> {
  const admin = createSupabaseAdminClient();
  
  const { data, error } = await admin
    .from('content_buckets')
    .select('id, bucket_key, label, description')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch buckets: ${error.message}`);
  }

  return data || [];
}
