import { Suspense } from 'react';
import { BucketsClient } from '@/components/BucketsClient';

interface BucketsPageProps {
  params: Promise<{ channelId: string }>;
}

export default async function BucketsPage({ params }: BucketsPageProps) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Content Buckets</h1>
        <p className="text-gray-600 mt-1">
          Analyze your video content categories and their performance patterns
        </p>
      </div>
      
      <Suspense fallback={
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
              <div className="h-3 bg-gray-200 rounded w-full mb-4"></div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      }>
        <BucketsClient channelId={channelId} />
      </Suspense>
    </div>
  );
}
