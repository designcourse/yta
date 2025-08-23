"use client";

import { useEffect, useState } from 'react';

interface YouTubeStatsData {
  views: number;
  subscribersGained: number;
  subscribersLost: number;
  netSubscriberChange: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  comments: number;
  likes: number;
  dislikes: number;
  shares: number;
  currentSubscribers: number;
  totalVideos: number;
  totalViews: number;
  channelTitle: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

interface YouTubeStatsProps {
  channelId: string;
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
};

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatWatchTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes % 60}m`;
};

export default function YouTubeStats({ channelId }: YouTubeStatsProps) {
  const [stats, setStats] = useState<YouTubeStatsData | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      if (!channelId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/youtube-stats?channelId=${encodeURIComponent(channelId)}`);
        const data = await response.json();
        
        if (response.ok) {
          setStats(data.stats);
          setDateRange(data.dateRange);
        } else {
          setError(data.error || 'Failed to fetch stats');
        }
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [channelId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const isTokenError = error.includes('access token');
    
    return (
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400 mb-2">Error loading stats</p>
        <p className="text-sm opacity-60 mb-4">{error}</p>
        {isTokenError && (
          <div className="space-y-2">
            <p className="text-sm">You may need to reconnect your YouTube account to access analytics.</p>
            <button 
              onClick={() => {
                const popup = window.open('/youtube-connect', 'youtube', 'width=500,height=600');
                window.addEventListener('message', function(event) {
                  if (event.data === 'youtube-connected') {
                    popup?.close();
                    window.location.reload();
                  }
                });
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Reconnect YouTube
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="opacity-60">No stats available for this channel</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">{stats.channelTitle}</h2>
        {dateRange && (
          <p className="text-sm opacity-60">
            Stats from {new Date(dateRange.startDate).toLocaleDateString()} to {new Date(dateRange.endDate).toLocaleDateString()} (90 days)
          </p>
        )}
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium opacity-60 mb-1">Views (90 days)</h3>
          <p className="text-2xl font-semibold">{formatNumber(stats.views)}</p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium opacity-60 mb-1">Watch Time</h3>
          <p className="text-2xl font-semibold">{formatWatchTime(stats.estimatedMinutesWatched)}</p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium opacity-60 mb-1">Subscribers</h3>
          <p className="text-2xl font-semibold">{formatNumber(parseInt(stats.currentSubscribers.toString()))}</p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium opacity-60 mb-1">Net Subscriber Change</h3>
          <p className={`text-2xl font-semibold ${stats.netSubscriberChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {stats.netSubscriberChange >= 0 ? '+' : ''}{formatNumber(stats.netSubscriberChange)}
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium opacity-60 mb-1">Avg View Duration</h3>
          <p className="text-2xl font-semibold">{formatDuration(stats.averageViewDuration)}</p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium opacity-60 mb-1">Comments</h3>
          <p className="text-2xl font-semibold">{formatNumber(stats.comments)}</p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium opacity-60 mb-1">Likes</h3>
          <p className="text-2xl font-semibold">{formatNumber(stats.likes)}</p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium opacity-60 mb-1">Shares</h3>
          <p className="text-2xl font-semibold">{formatNumber(stats.shares)}</p>
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4">Channel Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex justify-between">
            <span className="opacity-60">Total Videos:</span>
            <span className="font-medium">{formatNumber(parseInt(stats.totalVideos.toString()))}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Total Channel Views:</span>
            <span className="font-medium">{formatNumber(parseInt(stats.totalViews.toString()))}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Subscribers Gained (90d):</span>
            <span className="font-medium text-green-600 dark:text-green-400">+{formatNumber(stats.subscribersGained)}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Subscribers Lost (90d):</span>
            <span className="font-medium text-red-600 dark:text-red-400">-{formatNumber(stats.subscribersLost)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
