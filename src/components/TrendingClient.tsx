'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface TrendingVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnails: {
    default: { url: string };
    medium: { url: string };
    high: { url: string };
  };
  viewCount: string;
  likeCount: string;
  commentCount: string;
  tags?: string[];
}

interface TrendingClientProps {
  channelId: string;
  defaultSearchTerm: string;
  isAdmin: boolean;
}

function formatNumber(num: string | number): string {
  const n = typeof num === 'string' ? parseInt(num) : num;
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M';
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + 'k';
  }
  return n.toString();
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  return `${Math.floor(diffInDays / 30)} months ago`;
}

export default function TrendingClient({ channelId, defaultSearchTerm, isAdmin }: TrendingClientProps) {
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(defaultSearchTerm);
  const [timeFilter, setTimeFilter] = useState('24h');
  const [searchTerms, setSearchTerms] = useState('');
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  useEffect(() => {
    // Auto-load results on mount
    fetchTrending();
  }, [channelId]);

  async function fetchTrending() {
    setLoading(true);
    setError(null);
    setRateLimitError(null);

    try {
      const params = new URLSearchParams({
        channelId,
        maxResults: '20',
        query: searchQuery,
        timeFilter: timeFilter,
        isAdmin: isAdmin.toString()
      });

      const response = await fetch(`/api/trending/youtube?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          setRateLimitError(errorData.error || 'Rate limit exceeded');
        } else {
          throw new Error(errorData.error || 'Failed to fetch trending videos');
        }
        return;
      }

      const data = await response.json();
      setVideos(data.videos || []);
      setSearchTerms(data.searchTerms || '');
    } catch (err) {
      console.error('Error fetching trending:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    await fetchTrending();
  }

  return (
    <div>
      {/* Filters Section */}
      <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Search Query */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Query
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g., UI design AI tools"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-gray-900"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Search
              </button>
            </div>
          </div>

          {/* Time Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Time
            </label>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-gray-900 bg-white"
            >
              <option value="24h" className="text-gray-900">Last 24 hours</option>
              <option value="2d" className="text-gray-900">Last 2 days</option>
              <option value="3d" className="text-gray-900">Last 3 days</option>
              <option value="5d" className="text-gray-900">Last 5 days</option>
              <option value="1w" className="text-gray-900">Last week</option>
              <option value="2w" className="text-gray-900">Last 2 weeks</option>
              <option value="1m" className="text-gray-900">Last month</option>
            </select>
          </div>
        </div>

        {searchTerms && (
          <div className="text-sm text-gray-600">
            Showing trending videos for: <span className="font-medium">{searchTerms}</span>
          </div>
        )}
      </div>

      {/* Rate Limit Error */}
      {rateLimitError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 font-medium">⚠️ {rateLimitError}</p>
          <p className="text-yellow-700 text-sm mt-1">You can make up to 10 searches every 30 minutes.</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          <p className="mt-4 text-gray-600">Finding trending videos...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Videos Grid */}
      {!loading && !error && videos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <a
              key={video.id}
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-black transition-all hover:shadow-lg"
            >
              {/* Thumbnail */}
              <div className="relative w-full aspect-video bg-gray-100">
                <Image
                  src={video.thumbnails.high.url}
                  alt={video.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Title */}
                <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-gray-700 mb-2">
                  {video.title}
                </h3>

                {/* Channel */}
                <p className="text-xs text-gray-600 mb-3">{video.channelTitle}</p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {formatNumber(video.viewCount)}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                    {formatNumber(video.likeCount)}
                  </span>
                  <span>{formatDate(video.publishedAt)}</span>
                </div>

                {/* Tags */}
                {video.tags && video.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {video.tags.slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && videos.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No trending videos found. Try a different search.</p>
        </div>
      )}
    </div>
  );
}
