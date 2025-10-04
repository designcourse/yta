import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getRecentPerformanceBaseline, determineChannelStage, calculateUploadFrequency } from '@/utils/recent-performance';
import { getEnhancedBucketMetrics } from '@/utils/bucket-enhanced-analytics';
import { formatPerformanceNaturally, formatBucketSummary, formatTimeAgo, formatChannelAge } from '@/utils/natural-language-context';
import { getVideoAnalysisState, getPrepublishPrompt } from '@/utils/video-analysis-state';

type ContextTier = 'fast' | 'detailed';
type IntentType = 'video_ideas' | 'performance_review' | 'script_help' | 'general' | 'other';

interface ContextBundleResponse {
  tier: ContextTier;
  timestamp: string;
  cached: boolean;
  core: {
    channel: {
      name: string;
      age_days: number;
      age_description: string;
      total_videos: number;
      uploads_per_month: number;
      stage: 'new' | 'early' | 'growing' | 'mature';
    };
    latestVideo: {
      title: string;
      video_id: string;
      views: number;
      published_at: string;
      hours_since_publish: number;
      time_ago: string;
      simple_verdict: 'good' | 'ok' | 'poor' | 'too_early';
      needs_time: boolean;
      explanation: string;
      analysisState?: {
        window: string;
        userExperience: string;
        guidance: string;
        has3hrStats: boolean;
        has24hrStats: boolean;
        hasRetentionData: boolean;
        hasPrepublishAnalysis: boolean;
        prepublishPrompt: string;
      };
    } | null;
    nextVideo: {
      status: 'none' | 'planning' | 'ready';
      title?: string;
      planId?: string;
      hasThumbnail: boolean;
      hasOutline: boolean;
    };
    buckets: {
      total: number;
      summary: string;
      top3: Array<{
        label: string;
        videoCount: number;
        medianViews: number;
        successScore: number;
        trend: 'improving' | 'stable' | 'declining';
        uploadFrequency: 'high' | 'medium' | 'low';
        recommended: boolean;
        topicSaturation: 'low' | 'medium' | 'high';
      }>;
    };
  };
  detail?: {
    retention?: any;
    competitors?: any;
    script?: any;
    prepublish?: any;
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const intent = searchParams.get('intent') as IntentType || 'general';
    const includeDetail = searchParams.get('includeDetail') === 'true';
    const forceRefresh = searchParams.get('refresh') === 'true';

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get channel info for internal UUID
    const admin = createSupabaseAdminClient();
    const { data: channelData } = await admin
      .from('channels')
      .select('id, title, created_at')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!channelData) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const internalChannelId = channelData.id;
    
    // Get oldest video to estimate channel age (channels.created_at is when user connected, not YouTube creation date)
    const { data: oldestVideo } = await admin
      .from('video_metrics')
      .select('published_at')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .order('published_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    
    const channelStartDate = oldestVideo?.published_at || channelData.created_at;
    
    // Check cache first (unless force refresh or in development)
    const isDev = process.env.NODE_ENV === 'development';
    if (!forceRefresh && !isDev) {
      const cached = await getCachedContext(internalChannelId, intent);
      if (cached) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // Build context bundle with parallel queries
    const bundle = await buildContextBundle({
      userId: user.id,
      channelId,
      internalChannelId,
      channelTitle: channelData.title || 'Unknown Channel',
      channelCreatedAt: channelStartDate,
      intent,
      includeDetail,
      authCookie: request.headers.get('cookie') || '',
    });

    // Cache the result (skip in development)
    if (!isDev) {
      await cacheContext(internalChannelId, intent, bundle);
    }

    return NextResponse.json({ ...bundle, cached: false });

  } catch (error) {
    console.error('[ContextBundle] Error:', error);
    return NextResponse.json(
      { error: 'Failed to build context bundle' },
      { status: 500 }
    );
  }
}

/**
 * Build the complete context bundle with parallel queries
 */
async function buildContextBundle(opts: {
  userId: string;
  channelId: string;
  internalChannelId: string;
  channelTitle: string;
  channelCreatedAt: string;
  intent: IntentType;
  includeDetail: boolean;
}): Promise<ContextBundleResponse> {
  const { userId, channelId, internalChannelId, channelTitle, channelCreatedAt, intent, includeDetail } = opts;
  const admin = createSupabaseAdminClient();

  // Parallel queries for core context
  const [
    videoCountResult,
    uploadsPerMonth,
    latestVideoResult,
    bucketsResult,
    enhancedMetrics,
    nextVideoResult,
    recentBaseline,
  ] = await Promise.all([
    // Total video count
    admin.from('video_metrics').select('video_id', { count: 'exact', head: true }).eq('user_id', userId).eq('channel_id', channelId),
    
    // Upload frequency
    calculateUploadFrequency(userId, channelId),
    
    // Latest video - use latest_video_snapshots which is always populated
    admin.from('latest_video_snapshots')
      .select('video_id, video_title, view_count, published_at')
      .eq('channel_id', internalChannelId)
      .eq('user_id', userId)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    
    // Buckets
    admin.from('content_buckets')
      .select('id, bucket_key, label, description')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true }),
    
    // Enhanced bucket metrics
    getEnhancedBucketMetrics(userId, channelId),
    
    // Next video status
    admin.from('video_plans')
      .select('id, title, thumbnail_url')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .eq('is_next', true)
      .maybeSingle(),
    
    // Recent performance baseline
    getRecentPerformanceBaseline(userId, channelId),
  ]);

  const totalVideos = videoCountResult.count || 0;
  const stage = determineChannelStage(totalVideos);
  const channelAge = Math.floor((Date.now() - new Date(channelCreatedAt).getTime()) / (1000 * 60 * 60 * 24));

  // Process latest video with analysis state
  let latestVideo: ContextBundleResponse['core']['latestVideo'] = null;
  if (latestVideoResult.data) {
    const video = latestVideoResult.data;
    const publishedAt = new Date(video.published_at);
    const hoursSincePublish = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);

    // Fetch actual KPI-like data directly from video_metrics (lifetime/24h proxies) if available
    let kpiData: any = null;
    if (hoursSincePublish >= 24) {
      try {
        const { data: metricsData } = await admin
          .from('video_metrics')
          .select('avg_view_duration_sec, views_per_day, avg_view_pct, ctr')
          .eq('user_id', userId)
          .eq('channel_id', channelId)
          .eq('video_id', video.video_id)
          .maybeSingle();

        if (metricsData) {
          // Get baselines from recentBaseline.quantiles
          kpiData = {
            current: {
              avd_24h: metricsData.avg_view_duration_sec ?? null,
              vpd_24h: metricsData.views_per_day ?? null,
              retention_pct: metricsData.avg_view_pct ?? null,
              ctr_24h: metricsData.ctr ?? null,
            },
            baselines: recentBaseline.quantiles,
            verdicts: {
              avd_24h: Number.isFinite(Number(metricsData.avg_view_duration_sec)) && recentBaseline.quantiles.avd_24h
                ? (metricsData.avg_view_duration_sec >= recentBaseline.quantiles.avd_24h.median ? 'pass' : 'fail')
                : 'unknown',
              retention_pct: Number.isFinite(Number(metricsData.avg_view_pct)) && recentBaseline.quantiles.retention_pct
                ? (metricsData.avg_view_pct >= recentBaseline.quantiles.retention_pct.median ? 'pass' : 'fail')
                : 'unknown',
              vpd_24h: Number.isFinite(Number(metricsData.views_per_day)) && recentBaseline.quantiles.vpd_24h
                ? (metricsData.views_per_day >= recentBaseline.quantiles.vpd_24h.median ? 'pass' : 'fail')
                : 'unknown',
              ctr_24h: Number.isFinite(Number(metricsData.ctr)) && recentBaseline.quantiles.ctr_24h
                ? (metricsData.ctr >= recentBaseline.quantiles.ctr_24h.median ? 'pass' : 'fail')
                : 'unknown',
            },
          };
        }
      } catch (e) {
        console.warn('[ContextBundle] Failed to fetch KPI data:', e);
      }
    }

    const performance = formatPerformanceNaturally(
      {
        views: video.view_count || 0,
        avd_24h: kpiData?.current?.avd_24h || null,
        vpd_24h: kpiData?.current?.vpd_24h || null,
        retention_pct: kpiData?.current?.retention_pct || null,
        ctr_24h: kpiData?.current?.ctr_24h || null,
      },
      recentBaseline.quantiles,
      hoursSincePublish
    );

    // Check if this is the first video in system
    const isFirstInSystem = totalVideos === 1;
    
    // Check if this is the only video on the channel
    const { count: totalChannelVideos } = await admin
      .from('latest_video_snapshots')
      .select('video_id', { count: 'exact', head: true })
      .eq('channel_id', internalChannelId);
    const isOnlyVideoOnChannel = (totalChannelVideos || 0) <= 1;
    
    // Check for early metrics (T+3hr stats)
    const { data: earlyMetrics } = await admin
      .from('video_early_metrics')
      .select('views_3h')
      .eq('video_id', video.video_id)
      .eq('channel_id', channelId)
      .eq('status', 'collected')
      .maybeSingle();
    
    // Check for prepublish analysis
    const { data: prepublishVideo } = await admin
      .from('prepublish_videos')
      .select('status')
      .eq('video_id', video.video_id)
      .eq('status', 'ready')
      .maybeSingle();
    
    // Determine analysis state
    const analysisState = getVideoAnalysisState({
      hoursSincePublish,
      videosInSystem: totalVideos,
      isFirstInSystem,
      isOnlyVideoOnChannel,
      has3hrEarlyMetrics: !!earlyMetrics,
      hasPrepublishAnalysis: !!prepublishVideo,
    });

    // Precompute a ready-to-use summary string for the LLM
    let readySummary: string | undefined;
    if (kpiData?.current && kpiData?.baselines) {
      const curr = kpiData.current;
      const base = kpiData.baselines;
      const verd = kpiData.verdicts || {};
      const nextUnlockH = Math.max(0, 48 - Math.floor(hoursSincePublish));
      
      // Calculate differences as percentages for natural language
      const avdDiff = base?.avd_24h?.median ? ((curr.avd_24h - base.avd_24h.median) / base.avd_24h.median * 100) : 0;
      const vpdDiff = base?.vpd_24h?.median ? ((curr.vpd_24h - base.vpd_24h.median) / base.vpd_24h.median * 100) : 0;
      const retDiff = base?.retention_pct?.median ? (curr.retention_pct - base.retention_pct.median) : 0;
      
      // Determine overall performance in plain English
      const verdicts = [verd.avd_24h, verd.vpd_24h, verd.retention_pct].filter(Boolean);
      const passCount = verdicts.filter((v: string) => v === 'pass').length;
      
      let performanceText = '';
      if (passCount >= 2) {
        performanceText = 'This video is performing better than your recent uploads';
      } else if (passCount === 1) {
        performanceText = 'This video is performing similarly to your recent uploads';
      } else {
        performanceText = 'This video is underperforming compared to your recent uploads';
      }
      
      // Build specific performance insights
      const insights: string[] = [];
      
      if (verd.avd_24h === 'pass') {
        insights.push(`viewers are watching ${Math.abs(Math.round(avdDiff))}% longer than usual`);
      } else if (verd.avd_24h === 'fail') {
        insights.push(`viewers are dropping off ${Math.abs(Math.round(avdDiff))}% earlier than usual`);
      }
      
      if (verd.vpd_24h === 'pass') {
        insights.push(`it's getting ${Math.abs(Math.round(vpdDiff))}% more daily views`);
      } else if (verd.vpd_24h === 'fail') {
        insights.push(`it's getting ${Math.abs(Math.round(vpdDiff))}% fewer daily views`);
      }
      
      if (verd.retention_pct === 'fail' && retDiff < -5) {
        insights.push(`retention dropped by ${Math.abs(retDiff.toFixed(1))} percentage points—likely a pacing or hook issue`);
      }
      
      const insightText = insights.length > 0 ? ` — ${insights.join(', ')}.` : '.';
      
      readySummary = `${performanceText}${insightText}\n\nFull retention curves (minute-by-minute drop-off analysis) unlock in ${nextUnlockH} hours. Until then, focus on improving your next upload${!analysisState.hasPrepublishAnalysis ? '—upload a rough cut before publishing so I can spot issues early' : ''}.\n\n💡 Pro tip: Upload your rough cut before publishing for AI-powered pre-publish analysis. I can identify flat spots, pacing issues, and hook strength before your video goes live.`;
    }

    latestVideo = {
      title: video.video_title || 'Untitled',
      video_id: video.video_id,
      views: video.view_count || 0,
      published_at: video.published_at,
      hours_since_publish: Math.round(hoursSincePublish * 10) / 10,
      time_ago: formatTimeAgo(hoursSincePublish),
      simple_verdict: performance.verdict,
      needs_time: performance.needs_time,
      explanation: recentBaseline.message || performance.explanation,
      ready_response: readySummary,
      kpiData: kpiData ? {
        current: kpiData.current,
        baselines: kpiData.baselines,
        verdicts: kpiData.verdicts,
      } : null,
      analysisState: {
        window: analysisState.window,
        userExperience: analysisState.userExperience,
        guidance: analysisState.guidance,
        has3hrStats: analysisState.has3hrStats,
        has24hrStats: analysisState.has24hrStats,
        hasRetentionData: analysisState.hasRetentionData,
        hasPrepublishAnalysis: analysisState.hasPrepublishAnalysis,
        prepublishPrompt: getPrepublishPrompt(analysisState.hasPrepublishAnalysis),
      },
    };
  }

  // Process buckets
  const buckets = bucketsResult.data || [];
  const bucketMetrics = await Promise.all(
    buckets.map(async (bucket) => {
      const { data: videos } = await admin
        .from('video_metrics')
        .select('video_id, views, published_at')
        .eq('bucket_id', bucket.id)
        .eq('user_id', userId)
        .eq('channel_id', channelId);

      const views = (videos || []).map(v => v.views || 0).filter(v => v > 0);
      const sortedViews = [...views].sort((a, b) => a - b);
      const medianViews = sortedViews.length > 0
        ? sortedViews.length % 2 === 0
          ? (sortedViews[sortedViews.length / 2 - 1] + sortedViews[sortedViews.length / 2]) / 2
          : sortedViews[Math.floor(sortedViews.length / 2)]
        : 0;

      const enhanced = enhancedMetrics.get(bucket.id) || {
        trend: 'stable' as const,
        uploadFrequency: 'low' as const,
        recommended: false,
        topicSaturation: 'low' as const,
      };

      return {
        id: bucket.id,
        label: bucket.label,
        videoCount: videos?.length || 0,
        medianViews: Math.round(medianViews),
        successScore: 0, // Will calculate below
        ...enhanced,
      };
    })
  );

  // Calculate relative success scores
  const medianViewsArray = bucketMetrics.map(b => b.medianViews);
  const maxMedian = Math.max(...medianViewsArray, 1);
  const minMedian = Math.min(...medianViewsArray);
  
  bucketMetrics.forEach(bucket => {
    if (maxMedian === minMedian) {
      bucket.successScore = bucket.medianViews > 0 ? 75 : 0;
    } else {
      const relativeScore = (bucket.medianViews - minMedian) / (maxMedian - minMedian);
      bucket.successScore = Math.round(15 + (relativeScore * 85));
    }
  });

  bucketMetrics.sort((a, b) => b.successScore - a.successScore);
  const top3Buckets = bucketMetrics.slice(0, 3);

  // Process next video
  let nextVideoStatus: ContextBundleResponse['core']['nextVideo'] = {
    status: 'none',
    hasThumbnail: false,
    hasOutline: false,
  };

  if (nextVideoResult.data) {
    const plan = nextVideoResult.data;
    
    // Check if script exists
    const { data: scriptData } = await admin
      .from('scripts')
      .select('id')
      .eq('video_plan_id', plan.id)
      .eq('status', 'ready')
      .maybeSingle();

    nextVideoStatus = {
      status: 'planning',
      title: plan.title,
      planId: plan.id,
      hasThumbnail: !!plan.thumbnail_url,
      hasOutline: !!scriptData,
    };

    if (plan.thumbnail_url && scriptData) {
      nextVideoStatus.status = 'ready';
    }
  }

  // Build core context
  const bundle: ContextBundleResponse = {
    tier: includeDetail ? 'detailed' : 'fast',
    timestamp: new Date().toISOString(),
    cached: false,
    core: {
      channel: {
        name: channelTitle,
        age_days: channelAge,
        age_description: formatChannelAge(channelAge),
        total_videos: totalVideos,
        uploads_per_month: uploadsPerMonth,
        stage,
      },
      latestVideo,
      nextVideo: nextVideoStatus,
      buckets: {
        total: buckets.length,
        summary: formatBucketSummary(top3Buckets),
        top3: top3Buckets,
      },
    },
  };

  // Add detail tier based on intent (if requested)
  if (includeDetail) {
    bundle.detail = {};
    
    // Add intent-specific details
    if (intent === 'performance_review') {
      // Add retention tips, KPIs, etc.
      // (Reuse existing APIs - not rewriting everything)
    }
    
    if (intent === 'video_ideas') {
      // Add competitor titles, topic opportunities
    }
    
    if (intent === 'script_help') {
      // Add script outline, prepublish analysis
    }
  }

  return bundle;
}

/**
 * Get cached context if available and not expired
 */
async function getCachedContext(
  internalChannelId: string,
  intent: IntentType
): Promise<ContextBundleResponse | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from('neria_context')
      .select('prompt_text, updated_at, expires_at')
      .eq('channel_id', internalChannelId)
      .eq('prompt_type', `context_bundle_${intent}`)
      .maybeSingle();

    if (!data) return null;

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return null;
    }

    // Parse and return
    const parsed = JSON.parse(data.prompt_text);
    return parsed as ContextBundleResponse;
  } catch {
    return null;
  }
}

/**
 * Cache context bundle with adaptive TTL
 */
async function cacheContext(
  internalChannelId: string,
  intent: IntentType,
  bundle: ContextBundleResponse
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    
    // Calculate TTL based on latest video age
    const hoursSincePublish = bundle.core.latestVideo?.hours_since_publish || 999;
    let ttlMinutes: number;

    if (hoursSincePublish < 3) {
      ttlMinutes = 60; // 1 hour - too early for meaningful data
    } else if (hoursSincePublish < 24) {
      ttlMinutes = 15; // 15 minutes - active monitoring window
    } else if (hoursSincePublish < 72) {
      ttlMinutes = 30; // 30 minutes - recent upload
    } else {
      ttlMinutes = 120; // 2 hours - stable period
    }

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await admin.from('neria_context').upsert(
      {
        channel_id: internalChannelId,
        prompt_type: `context_bundle_${intent}`,
        prompt_text: JSON.stringify(bundle),
        tier: bundle.tier,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'channel_id,prompt_type' }
    );
  } catch (error) {
    console.error('[ContextBundle] Cache write failed:', error);
    // Non-fatal, continue
  }
}

