"use client";

import { useEffect, useState } from "react";

interface EarlyMetrics {
  id: string;
  video_id: string;
  published_at: string;
  scheduled_for: string;
  status: 'pending' | 'collected' | 'failed';
  views_3h: number | null;
  likes_3h: number | null;
  comments_3h: number | null;
  estimated_minutes_watched_3h: number | null;
  subscribers_gained_3h: number | null;
  collected_at: string | null;
  error_message: string | null;
}

interface Props {
  channelId: string;
  videoId: string;
  publishedAt: string;
}

export default function EarlyMetricsCard({ channelId, videoId, publishedAt }: Props) {
  const [metrics, setMetrics] = useState<EarlyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeToUnlock, setTimeToUnlock] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
    
    // Update time to unlock every minute
    const interval = setInterval(() => {
      if (metrics?.status === 'pending') {
        updateTimeToUnlock();
      }
    }, 60000); // Update every minute

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, videoId]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/early-metrics?channelId=${encodeURIComponent(channelId)}&videoId=${encodeURIComponent(videoId)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics);
        if (data.metrics?.status === 'pending') {
          updateTimeToUnlock(data.metrics);
        }
      }
    } catch (error) {
      console.error('Error fetching early metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateTimeToUnlock = (metricsData?: EarlyMetrics) => {
    const m = metricsData || metrics;
    if (!m) return;

    const scheduled = new Date(m.scheduled_for);
    const now = new Date();
    const diff = scheduled.getTime() - now.getTime();

    if (diff <= 0) {
      setTimeToUnlock('Collecting now...');
    } else {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) {
        setTimeToUnlock(`${hours}h ${minutes}m`);
      } else {
        setTimeToUnlock(`${minutes}m`);
      }
    }
  };

  // Don't show anything if video is older than 7 days
  const videoAge = Date.now() - new Date(publishedAt).getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (videoAge > sevenDays) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center animate-pulse">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-medium text-gray-900">Loading early metrics...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  if (metrics.status === 'pending') {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-medium text-gray-900">Early Performance Metrics (3h)</div>
            <div className="text-sm text-gray-600 mt-1">
              ⏰ Unlocks in <span className="font-semibold text-blue-600">{timeToUnlock}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Your 3-hour snapshot will be captured automatically and compared to your historical baseline
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (metrics.status === 'failed') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-medium text-red-900">Failed to collect early metrics</div>
            <div className="text-sm text-red-600 mt-1">{metrics.error_message}</div>
          </div>
        </div>
      </div>
    );
  }

  // Collected status - show the metrics
  const formatNumber = (num: number | null) => {
    if (num === null) return '—';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="font-medium text-gray-900">3-Hour Performance Snapshot</div>
            <div className="text-xs text-gray-600">
              Captured {metrics.collected_at ? new Date(metrics.collected_at).toLocaleString() : 'recently'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg p-3 border border-green-200">
          <div className="text-xs text-gray-600 mb-1">Views</div>
          <div className="text-xl font-bold text-gray-900">{formatNumber(metrics.views_3h)}</div>
        </div>

        <div className="bg-white rounded-lg p-3 border border-green-200">
          <div className="text-xs text-gray-600 mb-1">Likes</div>
          <div className="text-xl font-bold text-gray-900">{formatNumber(metrics.likes_3h)}</div>
        </div>

        <div className="bg-white rounded-lg p-3 border border-green-200">
          <div className="text-xs text-gray-600 mb-1">Comments</div>
          <div className="text-xl font-bold text-gray-900">{formatNumber(metrics.comments_3h)}</div>
        </div>

        {metrics.estimated_minutes_watched_3h !== null && (
          <div className="bg-white rounded-lg p-3 border border-green-200">
            <div className="text-xs text-gray-600 mb-1">Watch Time</div>
            <div className="text-xl font-bold text-gray-900">
              {formatNumber(metrics.estimated_minutes_watched_3h)}m
            </div>
          </div>
        )}

        {metrics.subscribers_gained_3h !== null && (
          <div className="bg-white rounded-lg p-3 border border-green-200">
            <div className="text-xs text-gray-600 mb-1">Subs Gained</div>
            <div className="text-xl font-bold text-gray-900">
              {metrics.subscribers_gained_3h > 0 ? '+' : ''}{formatNumber(metrics.subscribers_gained_3h)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-600">
        💡 This snapshot is from 3 hours post-publish and serves as your early performance baseline
      </div>
    </div>
  );
}



