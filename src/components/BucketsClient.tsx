'use client';

import { useState, useEffect } from 'react';
// Using simple SVG icons instead of Heroicons to avoid dependency issues
const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.94" />
  </svg>
);

const TrendingDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.511l-5.511-3.182" />
  </svg>
);

const VideoCameraIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const EyeIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5m-18 0h18" />
  </svg>
);

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
);

interface BucketAnalytics {
  id: string;
  key: string;
  label: string;
  description: string;
  videoCount: number;
  totalViews: number;
  averageViews: number;
  medianViews: number;
  successScore: number;
  topVideo: {
    videoId: string;
    views: number;
  } | null;
  recentVideos: number;
  videos: Array<{
    videoId: string;
    title: string;
    views: number;
  }>;
}

interface BucketsData {
  buckets: BucketAnalytics[];
  totalVideos: number;
  totalBuckets: number;
}

interface BucketsClientProps {
  channelId: string;
}

export function BucketsClient({ channelId }: BucketsClientProps) {
  const [data, setData] = useState<BucketsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBuckets() {
      try {
        setLoading(true);
        const response = await fetch(`/api/buckets/analytics?channelId=${channelId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch buckets: ${response.status}`);
        }
        
        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error('Error fetching buckets:', err);
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
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading buckets</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.buckets.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <VideoCameraIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Content Buckets Found</h3>
        <p className="text-gray-600">
          Content buckets will appear here once your videos are classified. 
          Try reconnecting your YouTube channel or uploading new videos.
        </p>
      </div>
    );
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  const getSuccessColor = (score: number): string => {
    if (score >= 70) return 'text-green-600 bg-green-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getSuccessIcon = (score: number) => {
    if (score >= 70) return <TrendingUpIcon className="h-4 w-4" />;
    if (score >= 40) return <StarIcon className="h-4 w-4" />;
    return <TrendingDownIcon className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <VideoCameraIcon className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Videos</p>
              <p className="text-2xl font-semibold text-gray-900">{data.totalVideos}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <div className="w-5 h-5 bg-purple-600 rounded-sm"></div>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Content Buckets</p>
              <p className="text-2xl font-semibold text-gray-900">{data.totalBuckets}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <EyeIcon className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Views</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatNumber(data.buckets.reduce((sum, bucket) => sum + bucket.totalViews, 0))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bucket Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.buckets.map((bucket, index) => (
          <div key={bucket.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
            {/* Header with rank badge */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-gray-900">{bucket.label}</h3>
                  {index === 0 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      🏆 Top Performer
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{bucket.description}</p>
              </div>
            </div>

            {/* Success Score */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Success Score</span>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getSuccessColor(bucket.successScore)}`}>
                  {getSuccessIcon(bucket.successScore)}
                  {bucket.successScore}/100
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    bucket.successScore >= 70 ? 'bg-green-500' :
                    bucket.successScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, bucket.successScore)}%` }}
                ></div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <VideoCameraIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Videos</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">{bucket.videoCount}</p>
              </div>
              
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <CalendarIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Recent</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">{bucket.recentVideos}</p>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Views</span>
                <span className="text-sm font-medium text-gray-900">{formatNumber(bucket.totalViews)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Median Views</span>
                <span className="text-sm font-medium text-gray-900">{formatNumber(bucket.medianViews)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Average Views</span>
                <span className="text-sm font-medium text-gray-900">{formatNumber(bucket.averageViews)}</span>
              </div>

              {bucket.topVideo && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Best Video</span>
                  <span className="text-sm font-medium text-green-600">{formatNumber(bucket.topVideo.views)}</span>
                </div>
              )}
            </div>

            {/* Video List */}
            {bucket.videos && bucket.videos.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Videos ({bucket.videos.length})
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {bucket.videos.map((video) => (
                    <div key={video.videoId} className="flex items-start justify-between gap-2 text-sm">
                      <a
                        href={`https://youtube.com/watch?v=${video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-gray-700 hover:text-blue-600 line-clamp-2 transition-colors"
                        title={video.title}
                      >
                        {video.title}
                      </a>
                      <span className="text-gray-500 font-medium whitespace-nowrap flex-shrink-0">
                        {formatNumber(video.views)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Success Score Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-8">
        <h4 className="text-sm font-medium text-blue-900 mb-2">How Success Score Works</h4>
        <p className="text-sm text-blue-800">
          Success scores are <strong>relative to your other content buckets</strong>. The top-performing 
          bucket gets 85-100 points, while others are scored proportionally. Scores combine median views 
          (avoiding outlier bias), consistency across videos, sample size reliability, and recent activity. 
          This shows which content types work best <em>for your channel</em> specifically.
        </p>
      </div>
    </div>
  );
}
