/**
 * Context Formatter for Neria
 * Converts the new context bundle API response into natural language for LLM consumption
 */

interface ContextBundle {
  tier: 'fast' | 'detailed';
  timestamp: string;
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
      ready_response?: string;
      kpiData?: {
        current: any;
        baselines: any;
        verdicts: any;
      } | null;
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
  detail?: any;
}

/**
 * Format context bundle into natural language for Neria's system prompt
 */
export function formatContextForNeria(bundle: ContextBundle): string {
  const lines: string[] = [];
  
  // PUT VIDEO PERFORMANCE RESPONSE AT THE VERY TOP - CLEAN AND SIMPLE
  const vid = bundle.core.latestVideo as any;
  if (vid?.ready_response) {
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('🎯 COPY THIS EXACT RESPONSE WHEN ASKED ABOUT VIDEO PERFORMANCE');
    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(vid.ready_response);
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('');
  }
  
  lines.push('=== CHANNEL CONTEXT ===');
  lines.push(`Refreshed: ${bundle.timestamp}`);
  lines.push('');

  // Channel basics
  const ch = bundle.core.channel;
  lines.push(`Channel: ${ch.name}`);
  lines.push(`Stage: ${ch.stage} (${ch.total_videos} videos, ${ch.age_description})`);
  lines.push(`Upload frequency: ${ch.uploads_per_month} videos/month (last 90 days)`);
  lines.push('');

  // Latest video performance - simplified since guidance is at top
  if (bundle.core.latestVideo) {
    const vid = bundle.core.latestVideo;
    lines.push('LATEST VIDEO:');
    lines.push(`"${vid.title}"`);
    lines.push(`Published: ${vid.time_ago} (${vid.views.toLocaleString()} views)`);
    
    if (vid.analysisState) {
      const state = vid.analysisState;
      lines.push('');
      lines.push('📊 DATA AVAILABILITY:');
      lines.push(`Analysis Window: ${state.window.replace('_', ' ').toUpperCase()}`);
      lines.push(`T+3hr Stats: ${state.has3hrStats ? '✅ Collected' : '⏳ Not collected'}`);
      lines.push(`T+24hr Stats: ${state.has24hrStats ? '✅ Available' : '⏳ Pending'}`);
      lines.push(`Retention Data: ${state.hasRetentionData ? '✅ Available' : '⏳ Unlocks at 48hr'}`);
      lines.push(`Prepublish Analysis: ${state.hasPrepublishAnalysis ? '✅ Uploaded' : '⏳ Not uploaded'}`);
      
      // Show actual KPI data if available
      if (vid.kpiData) {
        lines.push('');
        lines.push('📈 ACTUAL 24-HOUR METRICS:');
        const curr = vid.kpiData.current;
        const base = vid.kpiData.baselines;
        const verd = vid.kpiData.verdicts;
        
        if (curr.avd_24h !== null && curr.avd_24h !== undefined) {
          const verdict = verd?.avd_24h || 'unknown';
          const baseline = base?.avd_24h ? `(baseline: ${Math.round(base.avd_24h.median)}s)` : '';
          lines.push(`  AVD (Avg View Duration): ${Math.round(curr.avd_24h)}s ${baseline} - ${verdict.toUpperCase()}`);
        }
        
        if (curr.retention_pct !== null && curr.retention_pct !== undefined) {
          const verdict = verd?.retention_pct || 'unknown';
          const baseline = base?.retention_pct ? `(baseline: ${base.retention_pct.median.toFixed(1)}%)` : '';
          lines.push(`  Retention: ${curr.retention_pct.toFixed(1)}% ${baseline} - ${verdict.toUpperCase()}`);
        }
        
        if (curr.vpd_24h !== null && curr.vpd_24h !== undefined) {
          const verdict = verd?.vpd_24h || 'unknown';
          const baseline = base?.vpd_24h ? `(baseline: ${Math.round(base.vpd_24h.median)})` : '';
          lines.push(`  Views Per Day: ${Math.round(curr.vpd_24h)} ${baseline} - ${verdict.toUpperCase()}`);
        }
        
        if (curr.ctr_24h !== null && curr.ctr_24h !== undefined) {
          const verdict = verd?.ctr_24h || 'unknown';
          const baseline = base?.ctr_24h ? `(baseline: ${base.ctr_24h.median.toFixed(2)}%)` : '';
          lines.push(`  CTR: ${curr.ctr_24h.toFixed(2)}% ${baseline} - ${verdict.toUpperCase()}`);
        }
      }
    } else {
      lines.push(`Performance: ${vid.simple_verdict.toUpperCase()}`);
      lines.push(vid.explanation);
      
      if (vid.needs_time) {
        lines.push('');
        lines.push('⚠️ Note: This video needs more time/data before we can provide solid insights.');
      }
    }
  } else {
    lines.push('LATEST VIDEO: No recent uploads found');
  }
  lines.push('');

  // Next video status
  const nv = bundle.core.nextVideo;
  if (nv.status === 'none') {
    lines.push('NEXT VIDEO: Not yet planned');
  } else {
    lines.push(`NEXT VIDEO: "${nv.title || 'Untitled'}"`);
    const status: string[] = [];
    status.push(nv.hasThumbnail ? '✓ Thumbnail ready' : '⏳ Thumbnail needed');
    status.push(nv.hasOutline ? '✓ Script ready' : '⏳ Script needed');
    lines.push(`Status: ${nv.status} (${status.join(', ')})`);
  }
  lines.push('');

  // Content buckets
  const bk = bundle.core.buckets;
  if (bk.total > 0) {
    lines.push('CONTENT STRATEGY:');
    lines.push(bk.summary);
    lines.push('');
    
    if (bk.top3.length > 0) {
      lines.push('Top performing buckets:');
      bk.top3.forEach((bucket, idx) => {
        const trendEmoji = bucket.trend === 'improving' ? '📈' : bucket.trend === 'declining' ? '📉' : '—';
        const recEmoji = bucket.recommended ? '⭐' : '';
        lines.push(
          `${idx + 1}. "${bucket.label}" ${recEmoji}` +
          ` (${bucket.videoCount} videos, ${bucket.medianViews.toLocaleString()} median views, ${bucket.successScore}/100, ${trendEmoji} ${bucket.trend})`
        );
        
        if (bucket.topicSaturation === 'high' && bucket.trend !== 'improving') {
          lines.push(`   ⚠️ Topic may be saturated - consider variety`);
        }
      });
    }
  } else {
    lines.push('CONTENT STRATEGY: No content buckets created yet');
  }
  lines.push('');

  // Guardrails
  lines.push('=== COACHING GUARDRAILS ===');
  lines.push('- Base ALL recommendations on the facts above');
  lines.push('- Do NOT invent metrics, numbers, or video titles');
  lines.push('');
  lines.push('🚨 CRITICAL INSTRUCTION - READ CAREFULLY:');
  lines.push('When the user asks "How is my latest video performing?" or similar questions,');
  lines.push('you MUST use the exact guidance text provided in the box above (between the lines).');
  lines.push('This guidance is PRE-COMPUTED based on:');
  lines.push('  - Exact video age (hours since publish)');
  lines.push('  - User experience level (first video, new, or established)');
  lines.push('  - What data is actually available right now');
  lines.push('  - When the next data unlock happens');
  lines.push('');
  lines.push('Do NOT make up your own response. Do NOT estimate times. Do NOT guess data availability.');
  lines.push('Use the EXACT guidance provided above, word for word if needed.');
  lines.push('');
  lines.push('- Keep other advice specific, actionable, and grounded in channel context');
  lines.push('- When suggesting video ideas, reference the content buckets and their performance');
  lines.push('- For underperforming videos, focus on the specific issues identified above');
  
  if (ch.stage === 'new') {
    lines.push('- This is a NEW channel - focus on fundamentals, consistency, and finding what works');
  } else if (ch.stage === 'mature') {
    lines.push('- This is a MATURE channel - focus on optimization, patterns, and strategic pivots');
  }

  return lines.join('\n');
}

/**
 * Backward compatibility: format old-style context bundles
 * Used during migration period
 */
export function formatLegacyContext(legacyBundle: any): string {
  // If it's already a new-style bundle, use the new formatter
  if (legacyBundle?.core && legacyBundle?.tier) {
    return formatContextForNeria(legacyBundle);
  }

  // Otherwise, convert legacy format (existing neria-context.ts output)
  // This is a simplified fallback during migration
  return `LEGACY CONTEXT MODE\nContext data available but in old format. Consider refreshing.`;
}

