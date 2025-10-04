/**
 * Video Analysis State Determination
 * Determines what analysis is available based on video age, user history, and data windows
 */

export type AnalysisWindow = 
  | 'too_early'           // < 3 hours
  | 'early_3h'            // 3-24 hours (T+3hr stats available)
  | 'standard_24h'        // 24-48 hours (YouTube API 24hr stats available)
  | 'full_48h';           // > 48 hours (retention data typically available)

export type UserExperience = 
  | 'first_video'         // First video in system
  | 'new_creator'         // < 10 videos in system
  | 'established';        // >= 10 videos in system

export interface VideoAnalysisState {
  window: AnalysisWindow;
  userExperience: UserExperience;
  hoursSincePublish: number;
  hoursUntilNext: number | null;
  videosInSystem: number;
  hasComparableData: boolean;
  has3hrStats: boolean;
  has24hrStats: boolean;
  hasRetentionData: boolean;
  hasPrepublishAnalysis: boolean;
  guidance: string;
  encouragePrepublish: boolean;
}

/**
 * Determine analysis window based on hours since publish
 */
function determineWindow(hoursSincePublish: number): AnalysisWindow {
  if (hoursSincePublish < 3) return 'too_early';
  if (hoursSincePublish < 24) return 'early_3h';
  if (hoursSincePublish < 48) return 'standard_24h';
  return 'full_48h';
}

/**
 * Determine user experience level based on video count
 */
function determineUserExperience(videosInSystem: number, isFirstInSystem: boolean): UserExperience {
  if (isFirstInSystem || videosInSystem === 1) return 'first_video';
  if (videosInSystem < 10) return 'new_creator';
  return 'established';
}

/**
 * Calculate hours until next analysis milestone
 */
function hoursUntilNextMilestone(hoursSincePublish: number): number | null {
  if (hoursSincePublish < 3) return 3 - hoursSincePublish;
  if (hoursSincePublish < 24) return 24 - hoursSincePublish;
  if (hoursSincePublish < 48) return 48 - hoursSincePublish;
  return null;
}

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  
  if (wholeHours === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  if (minutes === 0) {
    return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''}`;
  }
  return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

/**
 * Generate coaching guidance based on video state
 */
function generateGuidance(opts: {
  window: AnalysisWindow;
  userExperience: UserExperience;
  hoursUntilNext: number | null;
  hasComparableData: boolean;
  hasPrepublishAnalysis: boolean;
  isOnlyVideoOnChannel: boolean;
}): string {
  const { window, userExperience, hoursUntilNext, hasComparableData, hasPrepublishAnalysis, isOnlyVideoOnChannel } = opts;
  
  // Case 1: Video < 3 hours old
  if (window === 'too_early') {
    const timeStr = hoursUntilNext ? formatTimeRemaining(hoursUntilNext) : '';
    
    if (userExperience === 'first_video') {
      return `Your preliminary stats will become available in ${timeStr}. Since this is your first video analyzed with Neria, the 3-hour analysis will lack comparisons. As you upload more videos, I'll be able to provide insights based on your channel's patterns. ${isOnlyVideoOnChannel ? 'Also, once this video reaches 24 hours, I can compare it to YouTube\'s broader benchmarks.' : 'In 24 hours, I can also compare this video to your other published content.'}`;
    }
    
    if (userExperience === 'new_creator') {
      return `Your preliminary stats will unlock in ${timeStr}. You have ${opts.hasComparableData ? 'some' : 'limited'} videos in our system, so comparisons will be basic. The more videos you upload, the better I can identify your patterns and winning formulas.`;
    }
    
    // Established creator
    return `Come back in ${timeStr} and I'll show you how this video compares to your recent uploads. We'll analyze early momentum, CTR, and initial retention patterns.`;
  }
  
  // Case 2: Video 3-24 hours old (T+3hr window)
  if (window === 'early_3h') {
    const timeStr = hoursUntilNext ? formatTimeRemaining(hoursUntilNext) : '';
    
    if (userExperience === 'first_video') {
      return `I can see your 3-hour stats, but since you just joined, there are no other videos with 3-hour data to compare against. Full comparison analytics will become available when this video reaches 24 hours (in ${timeStr}) via YouTube's API.`;
    }
    
    if (userExperience === 'new_creator') {
      return `Your 3-hour stats are available, but with limited comparison data from your other videos. As you upload more content, these early indicators become more meaningful. Full 24-hour analysis unlocks in ${timeStr}.`;
    }
    
    // Established creator
    return `🚀 Your 3-hour early stats are available!\n\n` +
           `What I can see now:\n` +
           `• Early momentum (views in first 3 hours)\n` +
           `• Comparison to your last 10 uploads at the same timestamp\n` +
           `• Predictive indicators of final performance\n\n` +
           `⏰ CRITICAL CHECKPOINT: In ${timeStr}, YouTube's full 24-hour analytics unlock. That's when I can give you the complete verdict on CTR, retention, and whether this video is a winner or needs rescue.\n\n` +
           `Early signs can guide whether to promote this video further or let the algorithm do its work.`;
  }
  
  // Case 3: Video 24-48 hours old (T+24hr YouTube API data)
  if (window === 'standard_24h') {
    const timeStr = hoursUntilNext ? formatTimeRemaining(hoursUntilNext) : '';
    
    if (userExperience === 'first_video' && isOnlyVideoOnChannel) {
      return `Your 24-hour stats are ready, but you'll need to upload more videos for meaningful comparisons. For now, I can analyze absolute performance. Full retention data (audience drop-off curves) typically unlocks at 48 hours (in ${timeStr}).`;
    }
    
    if (userExperience === 'first_video' && !isOnlyVideoOnChannel) {
      return `Your 24-hour stats are here! I can now compare this to your other published videos to see how it stacks up. Retention data unlocks in ${timeStr} for the complete analysis.`;
    }
    
    if (userExperience === 'new_creator') {
      return `Your 24-hour performance is locked in. I'm comparing it to your recent uploads, but with more videos, these insights become sharper. Retention curves arrive in ${timeStr}.`;
    }
    
    // Established creator
    return `Your video has passed the critical 24-hour mark. Here's what I can tell you:\n\n` +
           `✅ 24-hour YouTube Analytics data is now available\n` +
           `✅ I can compare this to your last 10-15 videos\n` +
           `✅ CTR, AVD (average view duration), and views-per-day metrics are locked in\n\n` +
           `⏰ NEXT UNLOCK: Full retention curves (minute-by-minute drop-off) in ${timeStr}\n\n` +
           `Right now, I can analyze how this video's 24-hour performance compares to your baseline. ${!hasPrepublishAnalysis ? 'Next time, upload a rough cut before publishing so I can spot issues early!' : 'Great job uploading the prepublish analysis - that data helps refine future videos.'}`;
  }
  
  // Case 4: Video > 48 hours old (Full analysis available)
  if (window === 'full_48h') {
    if (userExperience === 'first_video') {
      return `All analytics data is available, including retention curves! However, you need more videos in the system for accurate comparisons and to establish your channel's baseline. Upload more content so I can identify what works best for your audience.`;
    }
    
    if (userExperience === 'new_creator') {
      return `Full analytics are unlocked, including retention data. Your comparison baseline is still forming (need ~10 videos for confidence), but I can spot early patterns and opportunities.`;
    }
    
    // Established creator
    return `✅ COMPLETE ANALYSIS UNLOCKED (48+ hours)\n\n` +
           `All data is available:\n` +
           `• Full YouTube Analytics (24hr+ window)\n` +
           `• Minute-by-minute retention curves (where viewers drop off)\n` +
           `• CTR, AVD, watch time, subs gained\n` +
           `• Comparison to your established baseline (last 10-15 videos)\n\n` +
           `I can now identify:\n` +
           `📈 What's working (hooks, pacing, topics)\n` +
           `📉 What needs improvement (flat spots, losing viewers)\n` +
           `🎯 Specific action items for your next upload\n\n` +
           `Let's break down the numbers and plan your next experiment.`;
  }
  
  return 'Analysis in progress...';
}

/**
 * Main function: Determine complete video analysis state
 */
export function getVideoAnalysisState(opts: {
  hoursSincePublish: number;
  videosInSystem: number;
  isFirstInSystem: boolean;
  isOnlyVideoOnChannel: boolean;
  has3hrEarlyMetrics: boolean;
  hasPrepublishAnalysis: boolean;
}): VideoAnalysisState {
  const window = determineWindow(opts.hoursSincePublish);
  const userExperience = determineUserExperience(opts.videosInSystem, opts.isFirstInSystem);
  const hoursUntilNext = hoursUntilNextMilestone(opts.hoursSincePublish);
  
  // Determine what data is available
  const has3hrStats = opts.hoursSincePublish >= 3 && opts.has3hrEarlyMetrics;
  const has24hrStats = opts.hoursSincePublish >= 24;
  const hasRetentionData = opts.hoursSincePublish >= 48;
  
  // Comparable data exists if user is established (>=10 videos)
  const hasComparableData = userExperience === 'established';
  
  // Always encourage prepublish analysis if not yet done
  const encouragePrepublish = !opts.hasPrepublishAnalysis;
  
  const guidance = generateGuidance({
    window,
    userExperience,
    hoursUntilNext,
    hasComparableData,
    hasPrepublishAnalysis: opts.hasPrepublishAnalysis,
    isOnlyVideoOnChannel: opts.isOnlyVideoOnChannel,
  });
  
  return {
    window,
    userExperience,
    hoursSincePublish: opts.hoursSincePublish,
    hoursUntilNext,
    videosInSystem: opts.videosInSystem,
    hasComparableData,
    has3hrStats,
    has24hrStats,
    hasRetentionData,
    hasPrepublishAnalysis: opts.hasPrepublishAnalysis,
    guidance,
    encouragePrepublish,
  };
}

/**
 * Get prepublish analysis prompt
 */
export function getPrepublishPrompt(hasAnalysis: boolean): string {
  if (hasAnalysis) {
    return '✅ You\'ve uploaded your rough cut for pre-publish analysis. I can reference those insights (hook score, pacing, flat spots) in my recommendations.';
  }
  
  return '💡 Pro tip: Upload your rough cut before publishing for AI-powered pre-publish analysis. I can identify flat spots, pacing issues, and hook strength before your video goes live.';
}

