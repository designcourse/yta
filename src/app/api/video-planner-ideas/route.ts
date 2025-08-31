import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getClient, getCurrentModel } from "@/utils/openai";

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

  return {
    channelMeta,
    memoryProfile,
    latestVideo,
    aboutText,
    recentTitles,
    strategyPlan: strategy?.plan_text || null
  };
}

function buildVideoTitlePrompt(context: any): string {
  const { channelMeta, memoryProfile, latestVideo, aboutText, recentTitles, strategyPlan } = context;

  return `You are Neria, a YouTube strategy coach. Generate 6 compelling YouTube video title ideas for the channel "${channelMeta.title}".

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
    const prompt = buildVideoTitlePrompt(context);

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
    let prompt = buildVideoTitlePrompt(context);
    
    // If custom prompt is provided, modify the prompt to incorporate user's specific request
    if (customPrompt) {
      prompt += `\n\nUSER'S SPECIFIC REQUEST: "${customPrompt}"
Please generate titles that specifically address this request while still following all other requirements.`;
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
