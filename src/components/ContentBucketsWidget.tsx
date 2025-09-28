'use client';

import { useEffect, useState } from 'react';

type ContentBucket = {
  id: string;
  bucket_key: string;
  label: string;
  description: string | null;
};

type ContentBucketsWidgetProps = {
  channelId: string;
};

export default function ContentBucketsWidget({ channelId }: ContentBucketsWidgetProps) {
  const [buckets, setBuckets] = useState<ContentBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBuckets() {
      try {
        setLoading(true);
        const response = await fetch(`/api/content-buckets?channelId=${encodeURIComponent(channelId)}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch buckets');
        }

        const data = await response.json();
        setBuckets(data.buckets || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load buckets');
      } finally {
        setLoading(false);
      }
    }

    if (channelId) {
      fetchBuckets();
    }
  }, [channelId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900">Content Buckets</h3>
        <div className="mt-3 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <h3 className="text-lg font-medium text-red-900">Content Buckets</h3>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900">Content Buckets</h3>
        <p className="mt-2 text-sm text-gray-600">
          No content buckets found. Buckets are automatically created when you connect a new channel.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-medium text-gray-900">Content Buckets ({buckets.length})</h3>
      <p className="mt-1 text-sm text-gray-600">
        Your videos are automatically categorized into these content types.
      </p>
      
      <div className="mt-4 space-y-3">
        {buckets.map((bucket) => (
          <div key={bucket.id} className="flex items-start space-x-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="flex-shrink-0">
              <div className="h-2 w-2 rounded-full bg-blue-500 mt-2"></div>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-gray-900">{bucket.label}</h4>
              {bucket.description && (
                <p className="mt-1 text-xs text-gray-600">{bucket.description}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">Key: {bucket.bucket_key}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
