import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getClient, getCurrentModel } from "@/utils/openai";
import { getPrompt } from "@/utils/prompts";

// Normalize relative time expressions (e.g., "this year") to absolute dates for search queries
function normalizeRelativeTimeInQuery(text: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthIndex = now.getMonth();
  const thisMonthName = monthNames[monthIndex];

  const formatDate = (d: Date) => d.toISOString().slice(0,10);

  let result = text;

  // this year
  result = result.replace(/\bthis year\b/gi, String(year));

  // this month
  result = result.replace(/\bthis month\b/gi, `${thisMonthName} ${year}`);

  // today
  result = result.replace(/\btoday\b/gi, formatDate(now));

  // yesterday
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  result = result.replace(/\byesterday\b/gi, formatDate(yest));

  // this week -> date range Mon..Sun (ISO week: Monday start)
  result = result.replace(/\bthis week\b/gi, () => {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; // 0=Mon
    const monday = new Date(d);
    monday.setDate(d.getDate() - day);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `from ${formatDate(monday)} to ${formatDate(sunday)}`;
  });

  // last week -> previous Mon..Sun
  result = result.replace(/\blast week\b/gi, () => {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; // 0=Mon
    const lastMonday = new Date(d);
    lastMonday.setDate(d.getDate() - day - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return `from ${formatDate(lastMonday)} to ${formatDate(lastSunday)}`;
  });

  // last month
  result = result.replace(/\blast month\b/gi, () => {
    const d = new Date(year, monthIndex - 1, 1);
    const name = monthNames[d.getMonth()];
    return `${name} ${d.getFullYear()}`;
  });

  // last few months -> last 3 months range
  result = result.replace(/\blast few months\b/gi, () => {
    const start = new Date(year, monthIndex - 2, 1);
    const startName = monthNames[start.getMonth()];
    return `from ${startName} ${start.getFullYear()} to ${thisMonthName} ${year}`;
  });

  // last N months -> compute range
  result = result.replace(/\blast (\d{1,2}) months\b/gi, (_: string, nStr: string) => {
    const n = Math.max(1, Math.min(24, parseInt(nStr, 10)));
    const start = new Date(year, monthIndex - (n - 1), 1);
    const startName = monthNames[start.getMonth()];
    return `from ${startName} ${start.getFullYear()} to ${thisMonthName} ${year}`;
  });

  return result;
}

async function analyzeUserIntent(message: string, currentUrl: string, channelId?: string, supabase?: any): Promise<{
  action: 'generate_video_titles' | 'navigate_to_planner' | 'navigate_to_goals' | 'navigate_to_analytics' | 'chat_only' | 'other';
  requiresRedirect: boolean;
  targetUrl?: string;
  reasoning?: string;
}> {
  // Always use GPT-4o for intent analysis to keep Neria's behavior consistent
  const client = getClient('openai');
  const intentModel = 'gpt-4o';
  console.log('[Neria][Intent] Analyzing user intent', { messageSnippet: message.slice(0, 120), currentUrl, channelId });
  
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
- "give me titles", "generate titles", "video ideas", "what should I make videos about", "suggest video topics", "create video titles" = generate_video_titles
- "show me planner", "go to planner", "take me to video planner" = navigate_to_planner  
- "my goals", "set goals", "goal tracking" = navigate_to_goals
- "how is my channel doing", "show analytics", "performance" = navigate_to_analytics
- General questions, strategy advice, explanations, asking about topics/trends = chat_only

IMPORTANT: Only use "generate_video_titles" if the user is EXPLICITLY asking for video title suggestions, video ideas, or content creation help. Questions about topics, trends, or general information should be "chat_only".

Examples of "chat_only":
- "what is the most popular metal track..."
- "tell me about..."
- "how do I..."
- "what are the trends in..."
- "explain..."

Examples of "generate_video_titles":
- "give me video ideas"
- "suggest titles for my channel"
- "what videos should I make"
- "create video titles about..."

If the action would benefit from the user visiting a specific page, set requiresRedirect to true and provide the targetUrl - this will be used to generate a helpful link in the chat response instead of automatically redirecting.
For video title generation, if user is not on /planner page, provide a link to the planner page.

Respond ONLY with valid JSON in this exact format:
{
  "action": "generate_video_titles",
  "requiresRedirect": true,
  "targetUrl": "/dashboard/${channelId || '{channelId}'}/planner",
  "reasoning": "User is asking for video title generation"
}
`;

// (removed duplicate helper; now defined near the top of the file)

 

  try {
    const completion = await client.chat.completions.create({
      model: intentModel,
      messages: [
        { role: 'system', content: intentPrompt },
        { role: 'user', content: 'Analyze the user request and respond with the action JSON.' }
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const response = completion.choices?.[0]?.message?.content?.trim() || '{}';
    console.log('[Neria][Intent] Raw intent response:', response);
    
    // Accept raw JSON or fenced ```json blocks
    let jsonText = response.replace(/```json|```/g, '').trim();
    // If still not pure JSON, try to slice between first { and last }
    if (!(jsonText.startsWith('{') && jsonText.endsWith('}'))) {
      const start = jsonText.indexOf('{');
      const end = jsonText.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        jsonText = jsonText.slice(start, end + 1);
      }
    }
    const intent = JSON.parse(jsonText);
    
    // Validate the response
    if (!intent.action || !['generate_video_titles', 'navigate_to_planner', 'navigate_to_goals', 'navigate_to_analytics', 'chat_only', 'other'].includes(intent.action)) {
      throw new Error('Invalid action in AI response');
    }
    
    console.log('[Neria][Intent] Parsed intent:', intent);
    
    return {
      action: intent.action,
      requiresRedirect: intent.requiresRedirect || false,
      targetUrl: intent.targetUrl,
      reasoning: intent.reasoning || 'No reasoning provided'
    };
  } catch (error) {
    console.error('[Neria][Intent] Error analyzing user intent:', error);
    // Fallback to chat_only if AI analysis fails
    return {
      action: 'chat_only',
      requiresRedirect: false,
      reasoning: 'Failed to analyze intent, defaulting to chat'
    };
  }
}

async function getCurrentModelWithSupabase(supabase: any) {
  const { data: settings } = await supabase
    .from("model_settings")
    .select("current_model_id")
    .single();
  
  if (!settings?.current_model_id) {
    // Fallback to OpenAI GPT-4o for primary chat
    return {
      provider: "openai",
      model: "gpt-4o",
      max_input_tokens: 128000,
      max_output_tokens: 8192
    };
  }

  const { data: modelProvider } = await supabase
    .from("model_providers")
    .select("provider, model, max_input_tokens, max_output_tokens")
    .eq("id", settings.current_model_id)
    .single();

  return modelProvider || {
    provider: "openai",
    model: "gpt-4o",
    max_input_tokens: 128000,
    max_output_tokens: 8192
  };
}

async function countTokens(messages: Array<{ role: string; content: string }>, model: string): Promise<number> {
  // Calculate total character length for debugging
  const totalChars = messages.reduce((acc, msg) => acc + msg.role.length + msg.content.length, 0);
  console.log(`Token counting - Model: ${model}, Messages: ${messages.length}, Total chars: ${totalChars}`);
  
  try {
    // Try to use tiktoken for accurate token counting when available
    // Import dynamically to avoid issues in different environments
    const tiktoken = await import('tiktoken');
    const { encoding_for_model } = tiktoken;
    
    // Map models to their appropriate tiktoken encodings
    let encodingName = 'cl100k_base'; // Default for GPT-4/GPT-3.5
    
    if (model.includes('gpt-4')) {
      encodingName = 'cl100k_base';
    } else if (model.includes('gpt-3.5')) {
      encodingName = 'cl100k_base';
    } else if (model.includes('sonar') || model.includes('llama')) {
      // Perplexity models typically use similar tokenization to GPT-4
      encodingName = 'cl100k_base';
    }
    
    const encoding = encoding_for_model(encodingName as any);
    let totalTokens = 0;
    
    for (const message of messages) {
      // Count tokens for the message format: role + content
      totalTokens += 4; // Message formatting overhead
      totalTokens += encoding.encode(message.role).length;
      totalTokens += encoding.encode(message.content).length;
    }
    
    // Additional tokens for assistant response priming
    totalTokens += 3;
    
    encoding.free(); // Clean up memory
    console.log(`Token counting - Tiktoken result: ${totalTokens} tokens`);
    return totalTokens;
    
  } catch (error) {
    console.warn('Tiktoken failed, falling back to character estimation:', error);
    
    // Improved fallback calculation with better estimates
    let totalTokens = 0;
    
    for (const message of messages) {
      // More accurate character-per-token estimates based on empirical data
      // OpenAI/Perplexity models: ~3.3-3.7 chars per token for English text
      totalTokens += 4; // Message overhead
      totalTokens += Math.ceil(message.role.length / 3.3);
      totalTokens += Math.ceil(message.content.length / 3.3);
    }
    
    totalTokens += 3; // Response priming
    
    // Ensure we don't severely underestimate
    const minTokensFromChars = Math.ceil(totalChars / 3.0); // Conservative estimate
    totalTokens = Math.max(totalTokens, minTokensFromChars);
    
    console.log(`Token counting - Fallback result: ${totalTokens} tokens (from ${totalChars} chars)`);
    return totalTokens;
  }
}

// Determine if the user's query requires real-time web search (decided by GPT-4o)
async function shouldUseRealtimeSearch(message: string): Promise<{ needsSearch: boolean; query: string }> {
  try {
    console.log('[Neria][Realtime] Detecting need for web search...', { messageSnippet: message.slice(0, 160) });
    const client = getClient('openai');
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are Neria. Decide if the user query requires real-time web search (news, latest releases, current events, very recent data). Respond ONLY with JSON: {"needsSearch": true|false, "query": "web search query"}.',
        },
        { role: 'user', content: message },
      ],
      max_tokens: 60,
      temperature: 0,
    });
    const text = completion.choices?.[0]?.message?.content?.trim() || '{}';
    console.log('[Neria][Realtime] Detection raw response:', text);
    const parsed = JSON.parse(text);
    const decision = { needsSearch: !!parsed.needsSearch, query: parsed.query || message };
    console.log('[Neria][Realtime] Detection decision:', decision);
    return decision;
  } catch (e) {
    console.warn('[Neria][Realtime] Detection failed, defaulting to no search:', e);
    return { needsSearch: false, query: message };
  }
}

// Execute a Perplexity web search and return concise findings and sources
async function runPerplexitySearch(query: string): Promise<{ content: string; sources?: string[] }> {
  console.log('[Neria][Realtime] Running Perplexity search...', { query });
  const client = getClient('perplexity');
  // Use a valid Perplexity online model; fall back if unavailable
  const model = 'sonar-pro';
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a real-time researcher. Search the web and return a concise synthesis of up-to-date facts with bullet points. Include a short list of source URLs at the end prefixed by Sources:. Keep under 200 words.',
      },
      { role: 'user', content: query },
    ],
    max_tokens: 500,
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || '';
  // Best-effort source extraction
  const urlRegex = /(https?:\/\/[^\s)\]]+)/g;
  const sources = Array.from(new Set(content.match(urlRegex) || [])).slice(0, 8);
  console.log('[Neria][Realtime] Perplexity search complete', { contentLength: content.length, sourcesCount: sources.length });
  return { content, sources };
}

// Pull a verified list of recent metal songs from Perplexity with strict JSON structure
async function fetchVerifiedRecentMetalSongs(userRequest: string): Promise<Array<{ song: string; artist: string; month?: string; url?: string }>> {
  try {
    const client = getClient('perplexity');
    const model = 'sonar-pro';

    // Try to infer a year from the request; default to current year
    const yearMatch = userRequest.match(/20\d{2}/);
    const year = yearMatch ? yearMatch[0] : String(new Date().getFullYear());

    const messages = [
      {
        role: 'system',
        content:
          'You are a meticulous fact-checking research assistant. Only return information you can cite with an authoritative source URL. You must not invent song or band names.',
      },
      {
        role: 'user',
        content:
          `List 12 popular metal songs released in the last 3 months of ${year}. Only include songs by well-known bands. Return STRICT JSON only with an array under the key songs, where each item has: song (exact title), artist (band name), month (MMM YYYY), url (primary source such as the band site, label page, or major publication). Do not include any other text.`,
      },
    ];

    const completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 900,
      temperature: 0,
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    let jsonText = raw.trim();
    jsonText = jsonText.replace(/```json|```/g, '').trim();
    // Best effort slice between braces
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      jsonText = jsonText.slice(start, end + 1);
    }
    const parsed = JSON.parse(jsonText);
    const items = Array.isArray(parsed?.songs) ? parsed.songs : [];

    // Basic normalization & dedupe
    const seen = new Set<string>();
    const result: Array<{ song: string; artist: string; month?: string; url?: string }> = [];
    for (const item of items) {
      const song = String(item?.song || '').trim();
      const artist = String(item?.artist || '').trim();
      if (!song || !artist) continue;
      const key = `${song.toLowerCase()}__${artist.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ song, artist, month: item?.month ? String(item.month) : undefined, url: item?.url ? String(item.url) : undefined });
    }

    return result.slice(0, 12);
  } catch (error) {
    console.warn('[Neria][Research] Failed to fetch verified recent metal songs:', error);
    return [];
  }
}

function validateTitlesAgainstSongs(titleIdeas: string[], songs: Array<{ song: string; artist: string }>): string[] {
  const normalizedSongs = songs.map(s => ({
    song: s.song.toLowerCase(),
    artist: s.artist.toLowerCase(),
  }));

  const isTitleValid = (title: string) => {
    const t = title.toLowerCase();
    return normalizedSongs.some(s => t.includes(s.song) || t.includes(s.artist));
  };

  return titleIdeas.filter(t => typeof t === 'string' && t.trim().length > 0 && isTitleValid(t));
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
        const goalsAnswer = answers.find((a: { question?: string; answer?: string }) => 
          a.question && (a.question.toLowerCase().includes('goals') || 
          a.question.toLowerCase().includes('primary goals'))
        )?.answer || '';
        
        const timeAnswer = answers.find((a: { question?: string; answer?: string }) => 
          a.question && (a.question.toLowerCase().includes('time') || 
          a.question.toLowerCase().includes('commit'))
        )?.answer || '';
        
        const aboutAnswer = answers.find((a: { question?: string; answer?: string }) => 
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

async function buildSystemPrompt(context: {
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

  const base = await getPrompt('neria_chat_system');
  return [
    base,
    channelLine,
    profile,
    stats,
    about,
    titles,
    strategy,
  ].filter(Boolean).join("\n\n");
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

    // Use OpenAI GPT-4o for video idea generation (reliable and creative)
    const modelConfig = { provider: "openai", model: "gpt-4o" };
    const client = getClient(modelConfig.provider);
    let prompt = buildVideoTitlePrompt(context);
    
    // If custom prompt is provided, modify the prompt to incorporate user's specific request
    if (customPrompt) {
      prompt += `\n\nUSER'S SPECIFIC REQUEST: "${customPrompt}"
Please generate titles that specifically address this request while still following all other requirements.`;
    }

    // If the user's request appears to require up-to-date info (e.g., "recent", "latest", years),
    // fetch verifiable context from Perplexity and constrain the title generation to those facts.
    try {
      let decision = await shouldUseRealtimeSearch(customPrompt || "");
      if (decision?.needsSearch && decision.query) {
        const normalized = normalizeRelativeTimeInQuery(decision.query);
        if (normalized !== decision.query) {
          decision = { ...decision, query: normalized };
        }
      }
      if (decision.needsSearch) {
        // Fetch a strict JSON list of recent songs for validation
        const verifiedSongs = await fetchVerifiedRecentMetalSongs(decision.query);
        if (verifiedSongs.length > 0) {
          const topFew = verifiedSongs.slice(0, 12).map(s => `- ${s.artist} — ${s.song}${s.month ? ` (${s.month})` : ''}${s.url ? ` [${s.url}]` : ''}`).join('\n');
          prompt += `\n\nVERIFIED RECENT SONGS (only use these exact names if you reference songs):\n${topFew}\n\nSTRICT RULES:\n- Do NOT invent or guess any song or band names.\n- If you reference specific songs, ONLY use the exact titles/artists listed above.\n- It's acceptable to produce broader lesson titles without specific new song names.`;
        } else {
          const research = await runPerplexitySearch(decision.query);
          if (research?.content) {
            prompt += `\n\nREAL-TIME RESEARCH (use facts only, no inventions):\n${research.content}\n\nRULES:\n- If song titles are not explicitly present, avoid naming specific new songs.\n- Prefer broader lesson ideas or older well-known classics.`;
          }
        }
      }
    } catch (e) {
      console.warn('[Neria][VideoIdeas] Realtime research step failed or was skipped:', e);
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
      console.error('Error parsing AI response for video ideas:', error);
      return false;
    }

    // If we fetched verified songs above, defensively validate titles against them
    try {
      const looksRecent = /recent|latest|new|\b20\d{2}\b/i.test(customPrompt || '');
      if (looksRecent) {
        const verifiedSongs = await fetchVerifiedRecentMetalSongs(customPrompt || '');
        if (verifiedSongs.length > 0) {
          const validated = validateTitlesAgainstSongs(titleIdeas, verifiedSongs);
          if (validated.length >= 4) {
            titleIdeas = validated.slice(0, 6);
          } else {
            // Not enough validated titles; convert to generic ideas to avoid hallucinations
            // Preserve apostrophes; only strip suspicious parenthetical claims
            titleIdeas = titleIdeas.map(t => t.replace(/\b\((?:new|202\d).*?\)/gi, '').trim()).slice(0, 6);
          }
        }
      }
    } catch (e) {
      console.warn('[Neria][VideoIdeas] Validation step skipped due to error:', e);
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
    // Use OpenAI GPT-4o for summary generation 
    const modelConfig = { provider: "openai", model: "gpt-4o" };
    const client = getClient(modelConfig.provider);
    const completion = await client.chat.completions.create({
      model: modelConfig.model,
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

    // Load context FIRST to check for video generation intent
    const pinned = await loadPinnedContext(supabase, user.id, threadId);
    
    // Analyze user intent immediately to see if this is a video generation request
    if (pinned.channelId && pinned.channelMeta?.externalId) {
      const intent = await analyzeUserIntent(
        body.message, 
        body.currentUrl || '', 
        pinned.channelMeta.externalId,
        supabase
      );
      
      // If this is video generation, handle it immediately and return
      if (intent.action === 'generate_video_titles') {
        console.log('Video generation request detected - handling immediately');
        
        // Check if redirect is required (user not on planner page)
        const isOnPlannerPage = (body.currentUrl || '').includes('/planner');
        
        // Return streaming response with proper events for frontend
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            
            // If user is not on planner page, send link message but continue to generate titles
            if (!isOnPlannerPage && intent.requiresRedirect && intent.targetUrl) {
              console.log('User not on planner page, sending planner link');
              const plannerUrl = `/dashboard/${pinned.channelMeta.externalId}/planner`;
              const promptParam = body.message ? `?prompt=${encodeURIComponent(body.message)}` : '';
              const fullPlannerUrl = plannerUrl + promptParam;
              const linkMessage = `I’ll generate the titles now. You can view and manage them in the [Video Planner](${fullPlannerUrl}).`;

              await supabase
                .from("chat_messages")
                .insert({ thread_id: threadId, role: "assistant", content: linkMessage });

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'message',
                content: linkMessage
              })}\n\n`));
            }
            
            // Send starting message  
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'video_ideas_generating',
              message: 'Generating video ideas...'
            })}\n\n`));
            
            // Generate contextual response and video ideas
            try {
              const contextualResponse = await generateContextualResponse(body.message, pinned);
              
              // Store the brief response in database
              await supabase
                .from("chat_messages")
                .insert({ thread_id: threadId, role: "assistant", content: contextualResponse });
              
              // Send the brief contextual message to chat immediately
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'contextual_message', 
                content: contextualResponse 
              })}\n\n`));
              
              // Generate video ideas in background
              const success = await generateVideoIdeas(supabase, user.id, pinned.channelMeta.externalId, body.message);
              
              if (success) {
                // Send video generation complete event
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'video_ideas_generated',
                  message: contextualResponse
                })}\n\n`));
                
                // End stream
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                controller.close();
              } else {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'error',
                  message: 'Failed to generate video ideas. Please try again.'
                })}\n\n`));
                controller.close();
              }
            } catch (error) {
              console.error('Error in video generation flow:', error);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error',
                message: 'Failed to generate video ideas. Please try again.'
              })}\n\n`));
              controller.close();
            }
          }
        });
        
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }
    }

            // Get current model configuration
        const modelConfig = await getCurrentModelWithSupabase(supabase);
    const systemPrompt = await buildSystemPrompt(pinned);
    const history = await loadRecentMessages(supabase, threadId);

    // Assemble messages with proper alternation; GPT-4o is the primary chat model
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    messages.push({ role: "system", content: systemPrompt });
    
    // Filter history to ensure proper user/assistant alternation
    const filteredHistory: Array<{ role: string; content: string }> = [];
    let lastRole: string | null = null;
    
    for (const m of history) {
      // Skip system messages in history
      if (m.role === 'system') continue;
      
      if (m.role !== lastRole) {
        filteredHistory.push(m);
        lastRole = m.role;
      } else {
        // If same role as previous, concatenate content to avoid alternation issues
        if (filteredHistory.length > 0) {
          filteredHistory[filteredHistory.length - 1].content += "\n\n" + m.content;
        }
      }
    }
    
    // Ensure proper alternation: conversation should start with user message
    if (filteredHistory.length > 0 && filteredHistory[0].role === 'assistant') {
      // Remove the first assistant message if conversation starts with it
      filteredHistory.shift();
    }
    
    // Ensure conversation doesn't end with user message before adding new user message
    if (filteredHistory.length > 0 && filteredHistory[filteredHistory.length - 1].role === 'user') {
      // Remove the last user message to avoid two consecutive user messages
      filteredHistory.pop();
    }
    
    for (const m of filteredHistory) messages.push({ role: m.role as any, content: m.content });
    messages.push({ role: "user", content: body.message });
    
    // Debug log the final message structure
    console.log('Final messages structure:', messages.map(m => ({ role: m.role, contentLength: m.content.length })));

    // Optional: real-time research step
    let research: { content: string; sources?: string[] } | null = null;
    let realtimeDecision = await shouldUseRealtimeSearch(body.message);
    // Normalize relative-time phrases in the detected query to reflect the actual current date
    if (realtimeDecision?.needsSearch && realtimeDecision.query) {
      const normalized = normalizeRelativeTimeInQuery(realtimeDecision.query);
      if (normalized !== realtimeDecision.query) {
        realtimeDecision = { ...realtimeDecision, query: normalized };
      }
    }
    console.log('[Neria][Realtime] Should use search?', realtimeDecision);
    if (realtimeDecision.needsSearch) {
      try {
        research = await runPerplexitySearch(realtimeDecision.query);
        // Pass research into GPT-4o via an additional system message
        messages.push({
          role: 'system',
          content: `Real-time research findings (for assistant reference):\n${research.content}`,
        });
        console.log('[Neria][Realtime] Injected research into GPT-4o context', { injected: true });
      } catch (e) {
        console.warn('[Neria][Realtime] Perplexity search failed, continuing without research:', e);
      }
    }

    // Calculate context usage using GPT-4o budget
    const primaryModel = { model: 'gpt-4o', max_input_tokens: 128000, max_output_tokens: 8192 } as const;
    const inputTokens = await countTokens(messages, primaryModel.model);
    const maxTokens = primaryModel.max_input_tokens - primaryModel.max_output_tokens; // Reserve space for output
    const contextPercentage = Math.min(100, Math.ceil((inputTokens / maxTokens) * 100));
    


    // Call GPT-4o with streaming
    const client = getClient('openai');
    const stream = await client.chat.completions.create({
      model: primaryModel.model,
      messages,
      temperature: 0.4,
      max_tokens: Math.min(800, primaryModel.max_output_tokens),
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
            model: primaryModel.model,
            inputTokens,
            maxTokens
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initData)}\n\n`));

          // If we performed research, notify the client with a brief event before main streaming
          if (research) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'realtime_research', content: 'Fetched up-to-date info.' })}\n\n`));
          }

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
            pinned.channelMeta?.externalId,
            supabase
          );
          
          console.log('AI Intent Analysis:', {
            message: body.message,
            currentUrl: body.currentUrl,
            intent,
            hasChannelId: !!pinned.channelId,
            hasExternalId: !!pinned.channelMeta?.externalId
          });
          
          // Handle other navigation intents - send links instead of redirects
          if (intent.requiresRedirect && intent.targetUrl && pinned.channelMeta?.externalId) {
            try {
              console.log('AI determined navigation needed, sending link instead:', intent);
              
              // Replace {channelId} placeholder in targetUrl if present
              const targetUrl = intent.targetUrl.replace('{channelId}', pinned.channelMeta.externalId);
              
              // Generate appropriate message with clickable link based on intent
              let linkMessage = '';
              if (intent.action === 'navigate_to_goals') {
                linkMessage = `I can help you with goal tracking! Please visit your [Goals Dashboard](${targetUrl}) to set up and monitor your YouTube growth targets.`;
              } else if (intent.action === 'navigate_to_analytics') {
                linkMessage = `I'd be happy to help you analyze your channel performance! Check out your [Analytics Dashboard](${targetUrl}) to see detailed insights about your videos and audience.`;
              } else {
                // Fallback for other navigation types
                const pageName = intent.action.replace('navigate_to_', '').replace('_', ' ');
                linkMessage = `You can find that information on your [${pageName}](${targetUrl}) page.`;
              }
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'message',
                content: linkMessage
              })}\n\n`));
              
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
              const sum = await client.chat.completions.create({ model: primaryModel.model, messages: summaryMsgs as any, max_tokens: 300, temperature: 0 });
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


