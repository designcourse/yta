import { Quantiles } from '@/utils/baselines';

export interface VideoPerformance {
  views: number;
  avd_24h: number | null;
  vpd_24h: number | null;
  retention_pct: number | null;
  ctr_24h: number | null;
}

export interface PerformanceBaselines {
  avd_24h: Quantiles | null;
  vpd_24h: Quantiles | null;
  retention_pct: Quantiles | null;
  ctr_24h: Quantiles | null;
}

/**
 * Convert technical performance metrics to natural language explanation
 */
export function formatPerformanceNaturally(
  current: VideoPerformance,
  baselines: PerformanceBaselines,
  hoursSincePublish: number
): { verdict: 'good' | 'ok' | 'poor' | 'too_early'; explanation: string; needs_time: boolean } {
  
  // Too early for meaningful analysis
  if (hoursSincePublish < 3) {
    return {
      verdict: 'too_early',
      explanation: 'Too early to analyze - wait at least 3 hours after upload for initial insights',
      needs_time: true,
    };
  }

  // Not enough baseline data
  if (!baselines.avd_24h && !baselines.vpd_24h && !baselines.retention_pct) {
    return {
      verdict: 'too_early',
      explanation: 'Need more videos in our system for comparison. Wait 24 hours for YouTube\'s full analytics.',
      needs_time: true,
    };
  }

  const issues: string[] = [];
  const wins: string[] = [];

  // Check Average View Duration
  if (baselines.avd_24h && current.avd_24h !== null) {
    const usual = Math.round(baselines.avd_24h.median);
    const threshold = baselines.avd_24h.median - 0.5 * baselines.avd_24h.iqr;
    
    if (current.avd_24h < threshold) {
      const diff = Math.round(((usual - current.avd_24h) / usual) * 100);
      issues.push(`Viewers leaving ${diff}% earlier than usual (${Math.round(current.avd_24h)}s vs ${usual}s)`);
    } else if (current.avd_24h > baselines.avd_24h.median + 0.5 * baselines.avd_24h.iqr) {
      const diff = Math.round(((current.avd_24h - usual) / usual) * 100);
      wins.push(`Watch time up ${diff}%`);
    }
  }

  // Check Views Per Day
  if (baselines.vpd_24h && current.vpd_24h !== null) {
    const usual = Math.round(baselines.vpd_24h.median);
    const threshold = baselines.vpd_24h.median - 0.5 * baselines.vpd_24h.iqr;
    
    if (current.vpd_24h < threshold) {
      const diff = Math.round(((usual - current.vpd_24h) / usual) * 100);
      issues.push(`Views ${diff}% below usual (${current.vpd_24h.toLocaleString()} vs ${usual.toLocaleString()})`);
    } else if (current.vpd_24h > baselines.vpd_24h.median + 0.5 * baselines.vpd_24h.iqr) {
      const diff = Math.round(((current.vpd_24h - usual) / usual) * 100);
      wins.push(`Views up ${diff}%`);
    }
  }

  // Check Retention Percentage
  if (baselines.retention_pct && current.retention_pct !== null) {
    const usual = baselines.retention_pct.median.toFixed(1);
    const threshold = baselines.retention_pct.median - 0.5 * baselines.retention_pct.iqr;
    
    if (current.retention_pct < threshold) {
      issues.push(`Retention dropped to ${current.retention_pct.toFixed(1)}% (usual is ${usual}%)`);
    } else if (current.retention_pct > baselines.retention_pct.median + 0.5 * baselines.retention_pct.iqr) {
      wins.push(`Retention up to ${current.retention_pct.toFixed(1)}%`);
    }
  }

  // Check CTR (if available)
  if (baselines.ctr_24h && current.ctr_24h !== null) {
    const usual = baselines.ctr_24h.median.toFixed(2);
    const threshold = baselines.ctr_24h.median - 0.5 * baselines.ctr_24h.iqr;
    
    if (current.ctr_24h < threshold) {
      issues.push(`CTR below normal (${current.ctr_24h.toFixed(2)}% vs ${usual}%)`);
    } else if (current.ctr_24h > baselines.ctr_24h.median + 0.5 * baselines.ctr_24h.iqr) {
      wins.push(`CTR performing well (${current.ctr_24h.toFixed(2)}%)`);
    }
  }

  // Determine overall verdict
  if (wins.length > 0 && issues.length === 0) {
    return {
      verdict: 'good',
      explanation: 'Performing above your usual: ' + wins.join(', '),
      needs_time: false,
    };
  }

  if (issues.length === 0 && wins.length === 0) {
    return {
      verdict: 'ok',
      explanation: 'Performing within your normal range',
      needs_time: false,
    };
  }

  if (issues.length > 0) {
    return {
      verdict: 'poor',
      explanation: 'Underperforming:\n- ' + issues.join('\n- '),
      needs_time: false,
    };
  }

  return {
    verdict: 'ok',
    explanation: 'Performing within your normal range',
    needs_time: false,
  };
}

/**
 * Format bucket summary in natural language
 */
export function formatBucketSummary(buckets: Array<{
  label: string;
  videoCount: number;
  medianViews: number;
  successScore: number;
  trend: string;
  recommended: boolean;
}>): string {
  if (buckets.length === 0) return 'No content buckets yet';

  const top = buckets[0];
  const summary = [`Your "${top.label}" content performs best (${top.videoCount} videos, ${top.medianViews.toLocaleString()} median views)`];

  if (buckets.length > 1) {
    const others = buckets.slice(1, 3).map(b => 
      `"${b.label}" (${b.videoCount} videos, ${b.successScore} score)`
    );
    summary.push('Also have: ' + others.join(', '));
  }

  const recommended = buckets.find(b => b.recommended);
  if (recommended && recommended.label !== top.label) {
    summary.push(`Consider more "${recommended.label}" content - trending ${recommended.trend}`);
  }

  return summary.join('. ');
}

/**
 * Format time-based descriptions
 */
export function formatTimeAgo(hours: number): string {
  if (hours < 1) return 'less than an hour ago';
  if (hours < 2) return '1 hour ago';
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  if (hours < 48) return 'yesterday';
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

/**
 * Format channel age in natural language
 */
export function formatChannelAge(days: number): string {
  if (days < 30) return 'less than a month old';
  if (days < 60) return 'about a month old';
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} months old`;
  }
  const years = Math.round(days / 365);
  return `${years} year${years > 1 ? 's' : ''} old`;
}

