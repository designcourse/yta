import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";
import { aggregateYouTubeData } from "@/utils/youtube-aggregator";
import { runNeriaAnalyzer } from "@/utils/neria-openai";
import { runNeriaAnalyzerGemini } from "@/utils/neria-gemini";
import { ZNeriaOutput, EnhancedNeriaOutput } from "@/utils/types/neria";
import { analyzeChannelInsights } from "@/utils/insights-analyzer";
import { getPrompt, renderTemplate } from "@/utils/prompts";
import { runNeriaAnalyzerGemini as generateText } from "@/utils/neria-gemini";

// Simple per-process 24h cache keyed by user+channel (for response shape)
const previewCache = new Map<string, { expiresAt: number; payload: any }>();
const TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId");
    const refresh = url.searchParams.get("refresh");
    const testingMode = url.searchParams.get("testing") === "true";
    if (!channelId) {
      return NextResponse.json({ error: "channelId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const cacheKey = `${user.id}:${channelId}${testingMode ? ':testing' : ''}`;
    const cached = previewCache.get(cacheKey);
    if (!refresh && !testingMode && cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, { headers: { "Cache-Control": "public, max-age=86400" } });
    }

    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) return NextResponse.json({ error: token.error || "No YouTube access" }, { status: 400 });

    // Aggregate and analyze
    const { neriaInput, winners, losers, lifetimeViews } = await aggregateYouTubeData({
      userId: user.id,
      channelId,
      accessToken: token.accessToken,
      refreshToken: undefined,
    });
    console.log('[preview] channel', neriaInput.channel.id, 'title', neriaInput.channel.title);
    console.log('[preview] cadence per90d', neriaInput.cadence.per90d, 'per30d', neriaInput.cadence.per30d);
    console.log('[preview] winners count', winners.length, 'losers count', losers.length);

    // Run insights analysis first to get prioritized problems
    let insightsAnalysis;
    try {
      insightsAnalysis = await analyzeChannelInsights(neriaInput, testingMode);
      console.log('[preview] insights analysis completed, top insights:', insightsAnalysis.topInsights.length);
    } catch (e) {
      console.warn('[preview] insights analysis failed', e);
      insightsAnalysis = null;
    }

    let neriaOutput: EnhancedNeriaOutput;
    
    if (testingMode && insightsAnalysis && insightsAnalysis.topInsights.length > 0) {
      // In testing mode, convert all insights to slides for evaluation
      const insightSlides = insightsAnalysis.topInsights.map((insight, index) => ({
        id: (index + 1) as any,
        headline: `${insight.type.toUpperCase()}: ${insight.title}`,
        body: `${insight.description}\n\nImpact: ${insight.impact}/10 | Actionability: ${insight.actionability}/10 | Priority: ${insight.priority.toFixed(1)}`,
        keyStats: [
          { label: 'Impact Score', value: `${insight.impact}/10` },
          { label: 'Actionability', value: `${insight.actionability}/10` },
          { label: 'Priority Score', value: insight.priority.toFixed(1) },
          { label: 'Confidence', value: `${Math.round(insight.confidence * 100)}%` },
          ...insight.evidence.map(ev => ({ label: 'Evidence', value: ev }))
        ],
        actions: insight.actions,
        confidence: insight.confidence
      }));

      neriaOutput = {
        slides: insightSlides,
        tags: ['testing', 'insights', 'analysis'],
        upgradeHook: 'Testing mode: All 15 insight types displayed for impact/actionability evaluation.',
        insights: {
          topInsights: insightsAnalysis.topInsights,
          channelHealth: insightsAnalysis.channelHealth,
          growthPotential: insightsAnalysis.growthPotential
        }
      };
    } else {
      // Normal mode - use AI-generated slides
      try {
        // Prefer Gemini 2.5 Flash for speed/cost; fallback to OpenAI if it fails
        let baseOutput;
        try {
          baseOutput = await runNeriaAnalyzerGemini(neriaInput);
        } catch (gErr) {
          console.warn('[preview] Gemini analyzer failed, falling back to OpenAI', gErr);
          baseOutput = await runNeriaAnalyzer(neriaInput);
        }
        
        // If we have insights, create enhanced slides focusing on top problems
        if (insightsAnalysis && insightsAnalysis.topInsights.length > 0) {
          const topInsights = insightsAnalysis.topInsights.slice(0, 3);
          const enhancedSlides = topInsights.map((insight, index) => ({
            id: (index + 1) as 1 | 2 | 3,
            headline: insight.title,
            body: insight.description,
            keyStats: insight.evidence.map(ev => ({ label: 'Evidence', value: ev })),
            actions: insight.actions.slice(0, 4), // Limit to 4 actions
            confidence: insight.confidence
          }));
          
          // Generate insights analysis slide text
          const insightsSlideText = `I have identified ${insightsAnalysis.topInsights.length} key areas where your channel is underperforming. Your overall health score is ${insightsAnalysis.channelHealth.overall}%, with the biggest opportunity being ${insightsAnalysis.topInsights[0]?.title.toLowerCase() || 'content optimization'}. These insights are based on analyzing your recent performance against industry benchmarks and your own channel averages.`;
          
          // Create a slide 4 for insights (keep original 3-slide structure but add insights data)
          neriaOutput = {
            ...baseOutput,
            slides: enhancedSlides,
            insights: {
              topInsights: insightsAnalysis.topInsights,
              channelHealth: insightsAnalysis.channelHealth,
              growthPotential: insightsAnalysis.growthPotential
            }
          };
          
          // Store the insights slide text for frontend use
          if (!neriaOutput.slides[3]) {
            neriaOutput.slides.push({
              id: 3, // Will be handled as slide 4 in frontend (0-indexed)
              headline: 'Channel Health Analysis',
              body: insightsSlideText,
              keyStats: [
                { label: 'Health Score', value: `${insightsAnalysis.channelHealth.overall}%` },
                { label: 'Issues Found', value: `${insightsAnalysis.topInsights.length}` }
              ],
              actions: insightsAnalysis.topInsights[0]?.actions.slice(0, 3) || [],
              confidence: insightsAnalysis.topInsights[0]?.confidence || 0.8
            } as any);
          }
        } else {
          neriaOutput = baseOutput;
        }
      } catch (e) {
      // Fallback with insights if available
      const fallbackSlides = insightsAnalysis && insightsAnalysis.topInsights.length > 0 
        ? insightsAnalysis.topInsights.slice(0, 3).map((insight, index) => ({
            id: (index + 1) as 1 | 2 | 3,
            headline: insight.title,
            body: insight.description,
            keyStats: [],
            actions: insight.actions.slice(0, 3),
            confidence: insight.confidence
          }))
        : [
            { 
              id: 1, 
              headline: 'Channel snapshot', 
              body: 'We analyzed your recent activity and packaging. Some metrics are missing; connect analytics for deeper insights.', 
              keyStats: [], 
              actions: ['Publish regularly for 30 days', 'Clarify titles with outcome-first phrasing', 'Plan a Shorts + long-form mix'], 
              confidence: 0.5 
            },
            { 
              id: 2, 
              headline: 'What is working', 
              body: 'Top themes show potential. Double down on clear topics and consistent hooks.', 
              keyStats: [], 
              actions: ['Replicate top theme in 2 new videos', 'Test 3 title variants before publishing', 'Add an on-screen promise by 5 seconds'], 
              confidence: 0.5 
            },
            { 
              id: 3, 
              headline: 'Fix underperformers', 
              body: 'Avoid weak formats and reset thumbnails for clarity. Improve retention with faster pacing.', 
              keyStats: [], 
              actions: ['Trim 10-15% from intros', 'Front-load payoff in first 20s', 'Batch thumbnails and test contrasts'], 
              confidence: 0.5 
            },
          ];

      neriaOutput = {
        slides: fallbackSlides,
        tags: ['consistency', 'packaging', 'retention'],
        upgradeHook: 'Unlock retention heatmaps and CTR benchmarks for your niche.',
        insights: insightsAnalysis ? {
          topInsights: insightsAnalysis.topInsights,
          channelHealth: insightsAnalysis.channelHealth,
          growthPotential: insightsAnalysis.growthPotential
        } : undefined
      };
      const ok = ZNeriaOutput.safeParse(neriaOutput);
      if (!ok.success) throw e;
      }
    }

    const payload = {
      channelMeta: {
        id: neriaInput.channel.id,
        title: neriaInput.channel.title,
        subs: neriaInput.channel.subscribers,
        views: lifetimeViews || neriaInput.rollups.metrics.views,
        videoCount: neriaInput.channel.videoCount,
        publishedAt: neriaInput.channel.createdAt,
      },
      winners: winners.map(w => ({ videoId: w.id, title: w.title, thumb: w.thumb, publishedAt: w.publishedAt, duration: w.duration, viewsPerDay90: w.metrics.viewsPerDay })),
      losers: losers.map(l => ({ videoId: l.id, title: l.title, thumb: l.thumb, publishedAt: l.publishedAt, duration: l.duration, viewsPerDay90: 0 })),
      slides: neriaOutput.slides,
      insights: neriaOutput.insights, // Include insights data for frontend
    };

    previewCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, payload });

    return NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    console.error("/api/collection/preview error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


