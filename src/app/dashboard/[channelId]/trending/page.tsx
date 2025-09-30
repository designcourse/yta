import { createSupabaseServerClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import TrendingClient from '@/components/TrendingClient';

export const dynamic = 'force-dynamic';

export default async function TrendingPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/signin');
  }

  const { channelId } = await params;

  // Get channel details
  const { data: channel } = await supabase
    .from('channels')
    .select('*')
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .single();

  if (!channel) {
    redirect('/dashboard');
  }

  // Get user's buckets to determine core topic
  const { data: buckets } = await supabase
    .from('content_buckets')
    .select('id, label, description, video_metrics(views)')
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Find most popular bucket as default search term
  let defaultSearchTerm = 'technology trends';
  if (buckets && buckets.length > 0) {
    const bucketWithViews = buckets.map(bucket => ({
      ...bucket,
      totalViews: bucket.video_metrics?.reduce((sum: number, m: any) => sum + (m.views || 0), 0) || 0
    }));
    const topBucket = bucketWithViews.sort((a, b) => b.totalViews - a.totalViews)[0];
    defaultSearchTerm = topBucket?.label || defaultSearchTerm;
  }

  // Check if user is admin
  const { data: accountData } = await supabase
    .from('google_accounts')
    .select('account_email')
    .eq('user_id', user.id)
    .single();
  
  const isAdmin = accountData?.account_email === 'designcoursecom@gmail.com';

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trending Content Ideas</h1>
        <p className="text-gray-600 mt-1">
          Discover trending videos in your niche to inspire your next upload
        </p>
      </div>

      <TrendingClient 
        channelId={channelId} 
        defaultSearchTerm={defaultSearchTerm}
        isAdmin={isAdmin}
      />
    </div>
  );
}
