import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { generateTopicClustersWithGemini, VideoForClustering } from '@/utils/topic-cluster-analyzer';
import { getValidAccessToken } from '@/utils/googleAuth';
import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ channelId: string }>;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function loadVideos(userId: string, channelId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('video_metrics')
    .select('video_id, published_at, length_sec')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .order('published_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  if (!data || data.length === 0) return [] as VideoForClustering[];

  const seen = new Set<string>();
  const uniqueRows = data.filter((row) => {
    const videoId = row.video_id ?? '';
    if (!videoId || seen.has(videoId)) return false;
    seen.add(videoId);
    return true;
  }).slice(0, 50);

  if (uniqueRows.length === 0) return [] as VideoForClustering[];

  const tokenResult = await getValidAccessToken(userId, channelId);
  if (!tokenResult.success || !tokenResult.accessToken) {
    throw new Error('Unable to access YouTube API. Please reconnect the channel.');
  }

  const details = new Map<string, { title: string; description: string; durationSec?: number }>();
  const idBatches = chunk(uniqueRows.map((row) => row.video_id).filter((id): id is string => !!id), 45);
  for (const ids of idBatches) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('id', ids.join(','));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`YouTube API error ${res.status}: ${txt}`);
    }

    const json = await res.json();
    const items: any[] = Array.isArray(json?.items) ? json.items : [];
    for (const item of items) {
      const id = String(item?.id ?? '');
      if (!id) continue;
      const snippet = item?.snippet || {};
      const contentDetails = item?.contentDetails || {};
      const duration = typeof contentDetails?.duration === 'string' ? contentDetails.duration : undefined;

      let durationSec: number | undefined;
      if (duration) {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
          const h = Number(match[1] || 0);
          const m = Number(match[2] || 0);
          const s = Number(match[3] || 0);
          durationSec = h * 3600 + m * 60 + s;
        }
      }

      details.set(id, {
        title: snippet?.title || '',
        description: snippet?.description || '',
        durationSec,
      });
    }
  }

  return uniqueRows.map((row) => {
    const videoId = row.video_id ?? '';
    const meta = details.get(videoId) || { title: '', description: '' };
    return {
      id: videoId,
      title: meta.title || '',
      description: meta.description || '',
      publishedAt: row.published_at ?? undefined,
      durationSec: meta.durationSec ?? row.length_sec ?? undefined,
    } satisfies VideoForClustering;
  });
}

function renderTable(
  videos: VideoForClustering[],
  assignments: Map<string, string>,
  buckets: Map<string, { label: string }>,
) {
  if (videos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
        No cached videos were found for this channel. Try running the collection aggregator first.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Video Title</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Proposed Bucket</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {videos.map((video) => {
            const key = assignments.get(video.id);
            const bucket = key ? buckets.get(key) : null;
            return (
              <tr key={video.id}>
                <td className="px-4 py-3 align-top text-sm font-medium text-gray-900">
                  <div className="flex flex-col gap-1">
                    <span>{video.title || '(untitled video)'}</span>
                    {video.description ? (
                      <p className="line-clamp-2 text-xs text-gray-500">{video.description}</p>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-sm text-gray-700">
                  {bucket ? (
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{bucket.label}</span>
                      {bucket.label !== key ? (
                        <span className="text-xs text-gray-400">Key: {key}</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-gray-400">No bucket assigned</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ContentBucketsPage({ params }: Props) {
  const { channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const videos = await loadVideos(user.id, channelId);
  const totalVideos = videos.length;

  let geminiResult: Awaited<ReturnType<typeof generateTopicClustersWithGemini>> | null = null;
  let errorMessage: string | null = null;

  try {
    geminiResult = await generateTopicClustersWithGemini(videos);
  } catch (error) {
    console.error('[Content Buckets] Gemini error', error);
    errorMessage = error instanceof Error ? error.message : 'Gemini failed';
  }

  const bucketMap = new Map(
    geminiResult?.data.buckets.map((bucket) => [bucket.key, { label: bucket.label }]) ?? [],
  );
  const assignmentsMap = new Map(
    geminiResult?.data.assignments.map((assignment) => [assignment.videoId, assignment.bucketKey]) ?? [],
  );
  const tokenUsage = geminiResult?.tokenUsage ?? null;

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
          <h1 className="text-2xl font-semibold text-gray-900">Topic Bucket Preview</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Temporary preview that classifies the latest {Math.min(totalVideos, 40)} of {totalVideos} cached videos into up to five topic buckets using Gemini 2.5 Pro.
          Data is generated on demand and not stored.
        </p>
        {tokenUsage != null ? (
          <p className="mt-1 text-xs text-gray-500">
            Gemini token usage for this batch: {tokenUsage.toLocaleString()} tokens.
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {geminiResult?.data.buckets?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">Buckets ({geminiResult.data.buckets.length})</h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {geminiResult.data.buckets.map((bucket) => (
              <li key={bucket.key} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                <span className="font-semibold text-gray-900">{bucket.label}</span>
                {bucket.description ? <span className="ml-1 text-gray-500">— {bucket.description}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {renderTable(videos.slice(0, 40), assignmentsMap, bucketMap)}
    </div>
  );
}

