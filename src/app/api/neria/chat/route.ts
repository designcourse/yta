import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

async function analyzeUserIntent(message: string, currentUrl: string, channelId?: string): Promise<{
  action: 'generate_video_titles' | 'navigate_to_planner' | 'navigate_to_goals' | 'navigate_to_analytics' | 'chat_only' | 'other';
  requiresRedirect: boolean;
  targetUrl?: string;
  reasoning?: string;
}> {
  const openai = getOpenAI();
  
  const intentPrompt = `You are Neria, a YouTube strategy assistant. Analyze this user request and determine what action should be taken.

USER REQUEST: "${message}"
CURRENT URL: "${currentUrl}"

Determine the appropriate action based on the user's intent:

1. "generate_video_titles" - User wants video title ideas, suggestions, or inspiration
2. "navigate_to_planner" - User wants to go to video planner but isn't asking for titles
3. "navigate_to_goals" - User wants to set or view goals
4. "navigate_to_analytics" - User wants to see performance data or analytics
5. "chat_only" - User just wants to chat/ask questions, no specific action needed
6. "other" - Some other action (describe in reasoning)

Consider these patterns:
- "give me titles", "generate titles", "video ideas", "what should I make videos about" = generate_video_titles
- "show me planner", "go to planner", "take me to video planner" = navigate_to_planner  
- "my goals", "set goals", "goal tracking" = navigate_to_goals
- "how is my channel doing", "show analytics", "performance" = navigate_to_analytics
- General questions, strategy advice, explanations = chat_only

If the action requires the user to be on a different page than they currently are, set requiresRedirect to true and provide the targetUrl.
For video title generation, if user is not on /planner page, redirect them there first.

Respond ONLY with valid JSON in this exact format:
{
  "action": "generate_video_titles",
  "requiresRedirect": true,
  "targetUrl": "/dashboard/${channelId || '{channelId}'}/planner",
  "reasoning": "User is asking for video title generation"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: intentPrompt },
        { role: 'user', content: 'Analyze the user request and respond with the action JSON.' }
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const response = completion.choices?.[0]?.message?.content?.trim() || '{}';
    console.log('AI intent analysis response:', response);
    
    const intent = JSON.parse(response);
    
    // Validate the response
    if (!intent.action || !['generate_video_titles', 'navigate_to_planner', 'navigate_to_goals', 'navigate_to_analytics', 'chat_only', 'other'].includes(intent.action)) {
      throw new Error('Invalid action in AI response');
    }
    
    console.log('Parsed intent:', intent);
    
    return {
      action: intent.action,
      requiresRedirect: intent.requiresRedirect || false,
      targetUrl: intent.targetUrl,
      reasoning: intent.reasoning || 'No reasoning provided'
    };
  } catch (error) {
    console.error('Error analyzing user intent:', error);
    // Fallback to chat_only if AI analysis fails
    return {
      action: 'chat_only',
      requiresRedirect: false,
      reasoning: 'Failed to analyze intent, defaulting to chat'
    };
  }
}

async function getCurrentModel(supabase: any) {
  const { data: settings } = await supabase
    .from("model_settings")
    .select("current_model_id")
    .single();
  
  if (!settings?.current_model_id) {
    // Fallback to default gpt-4o-mini
    return {
      model: "gpt-4o-mini",
      max_input_tokens: 128000,
      max_output_tokens: 8000
    };
  }

  const { data: modelProvider } = await supabase
    .from("model_providers")
    .select("model, max_input_tokens, max_output_tokens")
    .eq("id", settings.current_model_id)
    .single();

  return modelProvider || {
    model: "gpt-4o-mini", 
    max_input_tokens: 128000,
    max_output_tokens: 8000
  };
}

function countTokens(messages: Array<{ role: string; content: string }>, model: string): number {
  // More accurate fallback estimation for OpenAI models
  // Based on empirical data: ~3.5-4 characters per token for English text
  let totalTokens = 0;
  
  for (const message of messages) {
    // Base tokens per message (OpenAI format overhead)
    totalTokens += 4; // <|start|>{role}<|message|> overhead
    
    // Count tokens for role and content
    const roleTokens = Math.ceil(message.role.length / 3.5);
    const contentTokens = Math.ceil(message.content.length / 3.5);
    
    totalTokens += roleTokens + contentTokens;
  }
  
  // Additional tokens for assistant response priming
  totalTokens += 3;
  
  // Add a small buffer for potential variations
  return Math.ceil(totalTokens * 1.1);
}

type ChatPostBody = {
  threadId?: string;
  channelId?: string; // YouTube channel id (external) or internal UUID; we resolve below
  message: string;
  currentUrl?: string; // Current page URL to check if redirect is needed
};

async function getOrCreateThread(supabase: any, userId: string, channelId?: string) {
  // ALWAYS require channelId for proper isolation
  if (!channelId) {
    throw new Error("channelId is required for thread creation/lookup to ensure proper channel isolation");
  }

  // Resolve provided channel id: prefer external YouTube channel_id; if it's a UUID, allow id match
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let channel: any = null;
  const { data: byExternal } = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", userId)
    .eq("channel_id", channelId)  // Look for YouTube channel ID
    .maybeSingle();
  
  channel = byExternal;

  const internalChannelId = channel?.id as string | undefined;

  const { data: existing } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("channel_id", internalChannelId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing.id as string;

  const { data: created } = await supabase
    .from("chat_threads")
    .insert({ user_id: userId, channel_id: internalChannelId, title: "Neria Chat" })
    .select("id")
    .single();

  return created?.id as string;
}

async function loadPinnedContext(supabase: any, userId: string, threadId: string) {
  // Get thread with channel id
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("channel_id")
    .eq("id", threadId)
    .single();

  const channelId = thread?.channel_id as string | undefined;

  // Channel meta (title, external id)
  let channelMeta: { title?: string; externalId?: string } | null = null;
  if (channelId) {
    const { data: ch } = await supabase
      .from("channels")
      .select("title, channel_id")
      .eq("id", channelId)
      .maybeSingle();
    if (ch) channelMeta = { title: ch.title || undefined, externalId: ch.channel_id };
  }

  // Memory profile (pin)
  let memoryProfile: any = null;
  if (channelId) {
    const { data: mp } = await supabase
      .from("memory_profile")
      .select("goals, preferences, constraints, updated_at")
      .eq("user_id", userId)
      .eq("channel_id", channelId)
      .single();
    
    memoryProfile = mp || null;
    
    // If no memory profile exists, try to build one from channel_questions
    if (!memoryProfile) {
      const { data: answers } = await supabase
        .from("channel_questions")
        .select("question, answer")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      
      if (answers && answers.length > 0) {
        const goalsAnswer = answers.find(a => 
          a.question && (a.question.toLowerCase().includes('goals') || 
          a.question.toLowerCase().includes('primary goals'))
        )?.answer || '';
        
        const timeAnswer = answers.find(a => 
          a.question && (a.question.toLowerCase().includes('time') || 
          a.question.toLowerCase().includes('commit'))
        )?.answer || '';
        
        const aboutAnswer = answers.find(a => 
          a.question && (a.question.toLowerCase().includes('about') || 
          a.question.toLowerCase().includes('channel is about'))
        )?.answer || '';

        // Create a temporary memory profile from answers
        if (goalsAnswer || timeAnswer || aboutAnswer) {
          memoryProfile = {
            goals: goalsAnswer ? `Goals: ${goalsAnswer}` : '',
            preferences: aboutAnswer ? `Channel Focus: ${aboutAnswer}` : '',
            constraints: timeAnswer ? `Time Commitment: ${timeAnswer}` : ''
          };
        }
      }
    }
  }

  // Stats summary: prefer stats_snapshots.latest else latest_video_snapshots
  let statsSummary: string | null = null;
  if (channelId) {
    const { data: s } = await supabase
      .from("stats_snapshots")
      .select("summary_text")
      .eq("channel_id", channelId)
      .eq("period", "latest")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    statsSummary = s?.summary_text || null;

    if (!statsSummary) {
      const { data: lv } = await supabase
        .from("latest_video_snapshots")
        .select("video_title, view_count, comment_count, published_at")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .limit(1)
        .single();
      if (lv) {
        statsSummary = `Latest video: ${lv.video_title} | Views: ${lv.view_count} | Comments: ${lv.comment_count} | Published: ${lv.published_at}`;
      }
    }
  }

  // Collection/NERIA context (about, titles)
  let aboutText = "";
  let recentTitles: string[] = [];
  let strategyPlan: string | null = null;
  if (channelId) {
    const { data: ctxRows } = await supabase
      .from("neria_context")
      .select("prompt_type, prompt_text")
      .eq("channel_id", channelId);
    aboutText = (ctxRows || []).find((r: any) => r.prompt_type === "channel_about")?.prompt_text || "";
    try {
      const raw = (ctxRows || []).find((r: any) => r.prompt_type === "recent_video_titles")?.prompt_text;
      if (raw) recentTitles = JSON.parse(raw);
    } catch {}

    // Load current strategy plan if available
    const { data: strat } = await supabase
      .from("channel_strategy")
      .select("plan_text")
      .eq("user_id", userId)
      .eq("channel_id", channelId)
      .maybeSingle();
    strategyPlan = strat?.plan_text || null;
  }

  return { channelId, channelMeta, memoryProfile, statsSummary, aboutText, recentTitles, strategyPlan };
}

async function loadRecentMessages(supabase: any, threadId: string, limit = 12) {
  const { data: msgs } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const all = msgs || [];
  // Basic budget by character length; take last N messages
  const recent = all.slice(Math.max(0, all.length - limit));
  return recent.map((m: any) => ({ role: m.role, content: m.content }));
}

function buildSystemPrompt(context: {
  channelMeta: { title?: string; externalId?: string } | null;
  memoryProfile: any;
  statsSummary: string | null;
  aboutText: string;
  recentTitles: string[];
  strategyPlan: string | null;
}) {
  const channelLine = context.channelMeta
    ? `Channel: ${context.channelMeta.title || "(untitled)"} (YouTube ID: ${context.channelMeta.externalId || "unknown"})`
    : "";
  const profile = context.memoryProfile
    ? `User Goals: ${context.memoryProfile.goals || ""}\nPreferences: ${context.memoryProfile.preferences || ""}\nConstraints: ${context.memoryProfile.constraints || ""}`
    : "";
  const stats = context.statsSummary ? `Latest Stats: ${context.statsSummary}` : "";
  const about = context.aboutText ? `About: ${context.aboutText}` : "";
  const titles = context.recentTitles?.length ? `Recent Titles: ${context.recentTitles.slice(0, 6).join(", ")}` : "";
  const strategy = context.strategyPlan ? `Current Strategy Plan (persisted):\n${context.strategyPlan}` : "";

  return [
    "You are Neria, a concise, pragmatic YouTube strategy coach.",
    "Always ground recommendations in the user's goals, constraints, the specific channel context, and latest stats.",
    channelLine,
    "When you make a suggestion, briefly explain why it matters and the expected impact.",
    "If a user asks you to generate video titles or video ideas, respond with a brief acknowledgment like 'Working on that for you...' or 'Let me generate some ideas...' If they're not already on the planner page, mention you're taking them there. Do NOT give long explanations.",
    profile,
    stats,
    about,
    titles,
    strategy,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function generateVideoIdeas(supabase: any, userId: string, channelId: string, customPrompt?: string): Promise<boolean> {
  try {
    // Get the internal channel UUID from the channels table
    const { data: channelData, error: channelError } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .single();

    if (channelError || !channelData) {
      console.error("Channel not found for video ideas generation:", channelError);
      return false;
    }

    const internalChannelId = channelData.id;

    // Load channel context (copied from video-planner-ideas route)
    const context = await loadChannelContextForVideos(supabase, userId, channelId);
    if (!context) {
      console.error("Could not load channel context for video ideas");
      return false;
    }

    const openai = getOpenAI();
    let prompt = buildVideoTitlePrompt(context);
    
    // If custom prompt is provided, modify the prompt to incorporate user's specific request
    if (customPrompt) {
      prompt += `\n\nUSER'S SPECIFIC REQUEST: "${customPrompt}"
Please generate titles that specifically address this request while still following all other requirements.`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
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
      console.error('Error parsing AI response for video ideas:', error);
      return false;
    }

    // Delete old ideas for this channel first
    const admin = createSupabaseAdminClient();
    await admin
      .from("video_planner_ideas")
      .delete()
      .eq("channel_id", internalChannelId)
      .eq("user_id", userId);

    // Store new ideas in database
    const ideasData = titleIdeas.map((title, index) => ({
      channel_id: internalChannelId,
      user_id: userId,
      title,
      position: index + 1,
      created_at: new Date().toISOString()
    }));

    const { error: saveError } = await admin
      .from("video_planner_ideas")
      .insert(ideasData);

    if (saveError) {
      console.error("Error saving video ideas:", saveError);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error generating video ideas:", error);
    return false;
  }
}

async function loadChannelContextForVideos(supabase: any, userId: string, channelId: string) {
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

async function generateContextualResponse(userRequest: string, pinnedContext: any): Promise<string> {
  const { channelMeta, memoryProfile, aboutText, recentTitles, statsSummary, strategyPlan } = pinnedContext;
  
  const prompt = `You are Neria, a concise YouTube strategy coach. A user just asked you to generate video titles with this request: "${userRequest}"

CHANNEL CONTEXT:
- Channel: ${channelMeta?.title || 'Unknown'}
- About: ${aboutText || 'Not provided'}
- Recent titles: ${recentTitles?.slice(0, 3).join(', ') || 'None'}
- Goals: ${memoryProfile?.goals || 'Not specified'}
- Latest stats: ${statsSummary || 'Not available'}

Respond with a SHORT (1-2 sentences max) contextual message about the video titles you just generated. Consider:
- If the request aligns well with their channel, be encouraging
- If it's off-topic, gently warn but stay supportive
- Reference their goals/performance when relevant
- Keep it conversational and brief
- Always mention they can find the titles in the Video Planner
- Do NOT wrap your response in quotes or any other punctuation marks

Examples:
- Generated 6 UI design titles perfect for your audience! Check the Video Planner.
- Created titles for cooking content - these might be outside your usual design niche, but could attract new viewers. Video Planner has them ready.
- New frontend titles generated based on your recent performance trends. Video Planner updated!`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate the contextual response now.' }
      ],
      max_tokens: 100,
      temperature: 0.7,
    });

    let response = completion.choices?.[0]?.message?.content || "I've generated new video title ideas for you. Check the Video Planner!";
    
    // Remove any surrounding quotes
    response = response.replace(/^["']|["']$/g, '');
    
    return response;
  } catch (error) {
    console.error('Error generating contextual response:', error);
    return "New video titles generated! Check the Video Planner to see them.";
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatPostBody;
    if (!body.message || !body.channelId) {
      return NextResponse.json({ error: "message and channelId required for proper channel isolation" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });



    // Always ensure thread is associated with the correct channel
    // Don't trust threadId from client if channelId is provided - validate it belongs to the channel
    let threadId: string;
    if (body.threadId && body.channelId) {
      // Verify the provided threadId actually belongs to this channel
      const { data: threadValidation } = await supabase
        .from("chat_threads")
        .select("channel_id")
        .eq("id", body.threadId)
        .eq("user_id", user.id)
        .single();
      
      if (threadValidation) {
        // Resolve the channel to get internal UUID
        const { data: channelData } = await supabase
          .from("channels")
          .select("id")
          .eq("user_id", user.id)
          .eq("channel_id", body.channelId)  // Look for YouTube channel ID
          .single();
        
        const expectedChannelId = channelData?.id;
        
        // If thread belongs to the expected channel, use it; otherwise create new one
        if (threadValidation.channel_id === expectedChannelId) {
          threadId = body.threadId;
        } else {
          console.log('Thread validation failed: thread belongs to different channel');
          threadId = await getOrCreateThread(supabase, user.id, body.channelId);
        }
      } else {
        console.log('Thread validation failed: thread not found or not owned by user');
        threadId = await getOrCreateThread(supabase, user.id, body.channelId);
      }
    } else {
      // Use the provided threadId or create new one
      threadId = body.threadId || (await getOrCreateThread(supabase, user.id, body.channelId));
    }

    // Store user message
    await supabase
      .from("chat_messages")
      .insert({ thread_id: threadId, user_id: user.id, role: "user", content: body.message });

    // Get current model configuration
    const modelConfig = await getCurrentModel(supabase);

    // Load context
    const pinned = await loadPinnedContext(supabase, user.id, threadId);
    const systemPrompt = buildSystemPrompt(pinned);
    const history = await loadRecentMessages(supabase, threadId);

    // Assemble messages
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    messages.push({ role: "system", content: systemPrompt });
    for (const m of history) messages.push({ role: m.role as any, content: m.content });
    messages.push({ role: "user", content: body.message });

    // Calculate context usage
    const inputTokens = countTokens(messages, modelConfig.model);
    const maxTokens = modelConfig.max_input_tokens - modelConfig.max_output_tokens; // Reserve space for output
    const contextPercentage = Math.min(100, Math.ceil((inputTokens / maxTokens) * 100));
    


    // Call model with streaming
    const openai = getOpenAI();
    const stream = await openai.chat.completions.create({
      model: modelConfig.model,
      messages,
      temperature: 0.4,
      max_tokens: Math.min(800, modelConfig.max_output_tokens),
      stream: true,
    });

    let assistantContent = "";

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial data with threadId and context percentage
          const initData = { 
            type: 'init', 
            threadId, 
            contextPercentage,
            model: modelConfig.model,
            inputTokens,
            maxTokens
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initData)}\n\n`));

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`));
            }
          }

          // Store the complete assistant message
          await supabase
            .from("chat_messages")
            .insert({ thread_id: threadId, role: "assistant", content: assistantContent });

          // Analyze user intent using AI
          const intent = await analyzeUserIntent(
            body.message, 
            body.currentUrl || '', 
            pinned.channelMeta?.externalId
          );
          
          console.log('AI Intent Analysis:', {
            message: body.message,
            currentUrl: body.currentUrl,
            intent,
            hasChannelId: !!pinned.channelId,
            hasExternalId: !!pinned.channelMeta?.externalId
          });
          
          // Handle the determined intent
          if (intent.action === 'generate_video_titles' && pinned.channelId && pinned.channelMeta?.externalId) {
            try {
              const currentUrl = body.currentUrl || '';
              const isOnPlannerPage = currentUrl.includes('/planner');
              
              if (!isOnPlannerPage && intent.requiresRedirect) {
                // Send redirect event first
                console.log('AI determined redirect needed to:', intent.targetUrl);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'redirect_to_planner',
                  channelId: pinned.channelMeta.externalId,
                  message: 'Taking you to the Video Planner to see your new titles...'
                })}\n\n`));
                
                // Add a small delay to ensure redirect happens before other events
                await new Promise(resolve => setTimeout(resolve, 100));
              } else {
                console.log('User already on planner page or no redirect needed');
              }
              
              // Dispatch event that video generation has started
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'video_ideas_generating',
                message: 'Starting to generate video ideas...'
              })}\n\n`));
              
              // Generate video title ideas directly without HTTP call
              const videoIdeasGenerated = await generateVideoIdeas(supabase, user.id, pinned.channelMeta.externalId, body.message);
              
              if (videoIdeasGenerated) {
                // Generate contextual response based on the request and channel data
                console.log('Generating contextual response for request:', body.message);
                const contextualResponse = await generateContextualResponse(body.message, pinned);
                console.log('Generated contextual response:', contextualResponse);
                
                // Always store the contextual response as a new assistant message
                const { error: insertError } = await supabase
                  .from("chat_messages")
                  .insert({ thread_id: threadId, role: "assistant", content: contextualResponse });
                
                if (insertError) {
                  console.error('Error inserting contextual response:', insertError);
                } else {
                  console.log('Successfully inserted contextual response to database');
                }
                
                // Add a small delay to ensure database write is committed
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Only send the contextual message event if user stays on same page
                if (isOnPlannerPage) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'contextual_message',
                    content: contextualResponse
                  })}\n\n`));
                }
                
                // Send notification that video ideas were generated
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'video_ideas_generated',
                  message: contextualResponse
                })}\n\n`));
              }
            } catch (error) {
              console.error('Error generating video ideas from chat:', error);
            }
          } else if (intent.requiresRedirect && intent.targetUrl && pinned.channelMeta?.externalId) {
            // Handle other navigation intents
            try {
              console.log('AI determined navigation needed:', intent);
              
              // Replace {channelId} placeholder in targetUrl if present
              const targetUrl = intent.targetUrl.replace('{channelId}', pinned.channelMeta.externalId);
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'navigate',
                targetUrl: targetUrl,
                message: `Taking you to ${intent.action.replace('navigate_to_', '').replace('_', ' ')}...`
              })}\n\n`));
              
              // Add a small delay for navigation
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
              console.error('Error handling navigation intent:', error);
            }
          }

          // Send completion signal
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();

          // Handle summarization in background (don't block the stream)
          const { data: countRows } = await supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("thread_id", threadId);
          const count = (countRows as any)?.length ?? 0;
          if (count > 30) {
            try {
              const summaryPrompt = "Summarize the conversation so far into a compact brief focusing on user goals, decisions, action items, and unresolved questions. Keep under 200 words.";
              const summaryMsgs = [{ role: "system" as const, content: summaryPrompt }, ...history.slice(-20)];
              const sum = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: summaryMsgs as any, max_tokens: 300, temperature: 0 });
              const summaryText = sum.choices?.[0]?.message?.content || null;
              if (summaryText) {
                await supabase
                  .from("thread_summaries")
                  .insert({ thread_id: threadId, summary_text: summaryText });
              }
            } catch {}
          }
        } catch (error) {
          console.error("Streaming error:", error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Streaming failed' })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    console.error("Neria chat error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


