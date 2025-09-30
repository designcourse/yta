import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getClient, getCurrentModel } from "@/utils/openai";
import { getPrompt } from "@/utils/prompts";

async function loadChannelContext(supabase: any, userId: string, channelId: string) {
  // Get channel metadata
  const { data: channelMeta } = await supabase
    .from("channels")
    .select("id, title, channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .single();

  if (!channelMeta) return null;

  // Get user's memory profile
  const { data: memoryProfile } = await supabase
    .from("memory_profile")
    .select("goals, preferences, constraints")
    .eq("user_id", userId)
    .eq("channel_id", channelMeta.id)
    .maybeSingle();

  // Get latest video info
  const { data: latestVideo } = await supabase
    .from("latest_video_snapshots")
    .select("video_title, view_count, comment_count, published_at")
    .eq("channel_id", channelMeta.id)
    .eq("user_id", userId)
    .limit(1)
    .single();

  // Get channel context (about, recent titles)
  const { data: ctxRows } = await supabase
    .from("neria_context")
    .select("prompt_type, prompt_text")
    .eq("channel_id", channelMeta.id);

  const aboutText = (ctxRows || []).find((r: any) => r.prompt_type === "channel_about")?.prompt_text || "";
  let recentTitles: string[] = [];
  try {
    const raw = (ctxRows || []).find((r: any) => r.prompt_type === "recent_video_titles")?.prompt_text;
    if (raw) recentTitles = JSON.parse(raw);
  } catch {}

  // Get current strategy plan
  const { data: strategy } = await supabase
    .from("channel_strategy")
    .select("plan_text")
    .eq("user_id", userId)
    .eq("channel_id", channelMeta.id)
    .maybeSingle();

  // Get content buckets analytics
  let contentBuckets = null;
  try {
    const admin = createSupabaseAdminClient();
    
    // Get all buckets for the channel
    const { data: buckets } = await admin
      .from('content_buckets')
      .select('id, bucket_key, label, description')
      .eq('user_id', userId)
      .eq('channel_id', channelMeta.id)
      .order('created_at', { ascending: true });

    if (buckets && buckets.length > 0) {
      // Get video metrics for all videos in these buckets
      const { data: videoMetrics } = await admin
        .from('video_metrics')
        .select('video_id, bucket_id, views, published_at')
        .eq('user_id', userId)
        .eq('channel_id', channelMeta.id)
        .not('bucket_id', 'is', null)
        .order('published_at', { ascending: false });

      // Calculate analytics for each bucket
      const bucketsWithAnalytics = buckets.map(bucket => {
        const bucketVideos = videoMetrics?.filter(v => v.bucket_id === bucket.id) || [];
        const views = bucketVideos.map(v => v.views || 0).filter(v => v > 0);
        
        // Calculate median views (more robust than average)
        const sortedViews = [...views].sort((a, b) => a - b);
        const medianViews = sortedViews.length > 0 
          ? sortedViews.length % 2 === 0
            ? (sortedViews[sortedViews.length / 2 - 1] + sortedViews[sortedViews.length / 2]) / 2
            : sortedViews[Math.floor(sortedViews.length / 2)]
          : 0;

        // Find top performing video
        const topVideo = bucketVideos.reduce((top, video) => {
          const videoViews = video.views || 0;
          if (!top || videoViews > (top.views || 0)) {
            return { videoId: video.video_id, views: videoViews };
          }
          return top;
        }, null as { videoId: string; views: number } | null);

        return {
          key: bucket.bucket_key,
          label: bucket.label,
          description: bucket.description || '',
          videoCount: bucketVideos.length,
          medianViews: Math.round(medianViews),
          topVideo,
        };
      });

      // Sort by median views (highest performing first)
      bucketsWithAnalytics.sort((a, b) => b.medianViews - a.medianViews);
      contentBuckets = bucketsWithAnalytics;
      console.log('[Video Ideas] Content buckets loaded:', contentBuckets.length, 'buckets');
      console.log('[Video Ideas] Top bucket:', contentBuckets[0]?.label, 'with', contentBuckets[0]?.medianViews, 'median views');
    }
  } catch (error) {
    console.error('Error loading content buckets for video ideas:', error);
  }

  return {
    channelMeta,
    memoryProfile,
    latestVideo,
    aboutText,
    recentTitles,
    strategyPlan: strategy?.plan_text || null,
    contentBuckets
  };
}

async function buildVideoTitlePrompt(context: any): Promise<string> {
  const { channelMeta, memoryProfile, latestVideo, aboutText, recentTitles, strategyPlan, contentBuckets } = context;

  const base = await getPrompt('video_planner_titles');
  const header = `Generate 6 compelling YouTube video title ideas for the channel "${channelMeta.title}".`;

  return `${base}

${header}

CHANNEL CONTEXT:
- Channel: ${channelMeta.title}
- About: ${aboutText || 'Not provided'}
- Recent Video Titles: ${recentTitles.slice(0, 5).join(', ') || 'None available'}

${latestVideo ? `LATEST VIDEO PERFORMANCE:
- Title: ${latestVideo.video_title}
- Views: ${latestVideo.view_count?.toLocaleString() || 'N/A'}
- Comments: ${latestVideo.comment_count?.toLocaleString() || 'N/A'}
- Published: ${latestVideo.published_at}
` : ''}

${memoryProfile ? `USER GOALS & PREFERENCES:
- Goals: ${memoryProfile.goals || 'Not specified'}
- Preferences: ${memoryProfile.preferences || 'Not specified'}
- Constraints: ${memoryProfile.constraints || 'Not specified'}
` : ''}

${strategyPlan ? `CURRENT STRATEGY:
${strategyPlan}
` : ''}

${contentBuckets && contentBuckets.length > 0 ? `CONTENT BUCKETS (Your proven content categories):
${contentBuckets.map((bucket: any) => 
  `- "${bucket.label}" (${bucket.videoCount} videos, ${bucket.medianViews.toLocaleString()} median views${bucket.topVideo ? `, best: ${bucket.topVideo.views.toLocaleString()} views` : ''})`
).join('\n')}

IMPORTANT: When generating titles, strongly consider these content buckets as they represent your most successful content types. Focus especially on your top-performing buckets.
` : ''}

REQUIREMENTS:
1. Generate exactly 6 video title ideas
2. Make titles compelling, clickable, and aligned with the channel's content
3. Consider current trends and high-performing patterns
4. Ensure titles are optimized for YouTube search and discovery
5. Make each title unique and appealing to the target audience
6. Keep titles between 40-60 characters for optimal display

Return ONLY a JSON array of 6 title strings, no additional text or formatting:
["Title 1", "Title 2", "Title 3", "Title 4", "Title 5", "Title 6"]`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    
    if (!channelId) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // First, get the internal channel UUID from the channels table
    const { data: channelData, error: channelError } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError || !channelData) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const internalChannelId = channelData.id;

    // Check if we already have recent ideas (within last 24 hours)
    const admin = createSupabaseAdminClient();
    
    const { data: existingIdeas } = await admin
      .from("video_planner_ideas")
      .select("*")
      .eq("channel_id", internalChannelId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6);

    // If we have recent ideas (less than 24 hours old), return them
    if (existingIdeas && existingIdeas.length > 0) {
      const latestIdea = existingIdeas[0];
      const ideasAge = Date.now() - new Date(latestIdea.created_at).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      if (ideasAge < twentyFourHours) {
        return NextResponse.json({
          ideas: existingIdeas,
          fromCache: true
        });
      }
    }

    // Generate fresh ideas using AI
    const context = await loadChannelContext(supabase, user.id, channelId);
    if (!context) {
      return NextResponse.json({ error: "Could not load channel context" }, { status: 404 });
    }

    // Use OpenAI GPT-4o for video planning (reliable and creative)
    const modelConfig = { provider: "openai", model: "gpt-4o" };
    const client = getClient(modelConfig.provider);
    const prompt = await buildVideoTitlePrompt(context);
    
    console.log('[Video Ideas] Generated prompt includes content buckets:', prompt.includes('CONTENT BUCKETS'));
    if (context.contentBuckets && context.contentBuckets.length > 0) {
      console.log('[Video Ideas] Using content buckets in prompt. Top bucket:', context.contentBuckets[0].label);
    } else {
      console.log('[Video Ideas] No content buckets available for prompt');
    }

    const completion = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate the 6 video title ideas now.' }
      ],
      max_tokens: 500,
      temperature: 0.8, // Higher creativity for titles
    });

    const response = completion.choices?.[0]?.message?.content || '[]';
    
    let titleIdeas: string[] = [];
    try {
      titleIdeas = JSON.parse(response);
      if (!Array.isArray(titleIdeas) || titleIdeas.length !== 6) {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return NextResponse.json({ error: "Failed to generate valid title ideas" }, { status: 500 });
    }

    // Delete old ideas for this channel first
    await admin
      .from("video_planner_ideas")
      .delete()
      .eq("channel_id", internalChannelId)
      .eq("user_id", user.id);

    // Store new ideas in database
    const ideasData = titleIdeas.map((title, index) => ({
      channel_id: internalChannelId,
      user_id: user.id,
      title,
      position: index + 1,
      created_at: new Date().toISOString()
    }));

    const { data: savedIdeas, error: saveError } = await admin
      .from("video_planner_ideas")
      .insert(ideasData)
      .select();

    if (saveError) {
      console.error("Error saving ideas:", saveError);
      return NextResponse.json({ error: "Failed to save video ideas" }, { status: 500 });
    }

    return NextResponse.json({
      ideas: savedIdeas,
      fromCache: false
    });

  } catch (error) {
    console.error("Video planner ideas error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { channelId, customPrompt } = await request.json();
    
    if (!channelId) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the internal channel UUID from the channels table
    const { data: channelData, error: channelError } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError || !channelData) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const internalChannelId = channelData.id;

    // Generate fresh ideas using AI with custom prompt if provided
    const context = await loadChannelContext(supabase, user.id, channelId);
    if (!context) {
      return NextResponse.json({ error: "Could not load channel context" }, { status: 404 });
    }

    // Use OpenAI GPT-4o for video planning (reliable and creative)
    const modelConfig = { provider: "openai", model: "gpt-4o" };
    const client = getClient(modelConfig.provider);
    let prompt = await buildVideoTitlePrompt(context);
    
    console.log('[Video Ideas POST] Generated prompt includes content buckets:', prompt.includes('CONTENT BUCKETS'));
    if (context.contentBuckets && context.contentBuckets.length > 0) {
      console.log('[Video Ideas POST] Using content buckets in prompt. Top bucket:', context.contentBuckets[0].label);
    } else {
      console.log('[Video Ideas POST] No content buckets available for prompt');
    }
    
    // If custom prompt is provided, modify the prompt to incorporate user's specific request
    if (customPrompt) {
      prompt += `\n\nUSER'S SPECIFIC REQUEST: "${customPrompt}"
Please generate titles that specifically address this request while still following all other requirements.`;
      console.log('[Video Ideas POST] Added custom prompt:', customPrompt);
    }

    const completion = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate the 6 video title ideas now.' }
      ],
      max_tokens: 500,
      temperature: 0.8,
    });

    const response = completion.choices?.[0]?.message?.content || '[]';
    
    let titleIdeas: string[] = [];
    try {
      titleIdeas = JSON.parse(response);
      if (!Array.isArray(titleIdeas) || titleIdeas.length !== 6) {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return NextResponse.json({ error: "Failed to generate valid title ideas" }, { status: 500 });
    }

    // Delete old ideas for this channel first
    const admin = createSupabaseAdminClient();
    await admin
      .from("video_planner_ideas")
      .delete()
      .eq("channel_id", internalChannelId)
      .eq("user_id", user.id);

    // Store new ideas in database
    const ideasData = titleIdeas.map((title, index) => ({
      channel_id: internalChannelId,
      user_id: user.id,
      title,
      position: index + 1,
      created_at: new Date().toISOString()
    }));

    const { data: savedIdeas, error: saveError } = await admin
      .from("video_planner_ideas")
      .insert(ideasData)
      .select();

    if (saveError) {
      console.error("Error saving ideas:", saveError);
      return NextResponse.json({ error: "Failed to save video ideas" }, { status: 500 });
    }

    return NextResponse.json({
      ideas: savedIdeas,
      fromCache: false
    });

  } catch (error) {
    console.error("Video planner ideas POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
