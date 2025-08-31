import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/utils/supabase/server";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
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
};

async function getOrCreateThread(supabase: any, userId: string, channelId?: string) {
  // If a thread exists for user+channel, reuse the most recent; else create
  if (!channelId) {
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (thread) return thread.id as string;
    const { data: created } = await supabase
      .from("chat_threads")
      .insert({ user_id: userId, title: "Conversation" })
      .select("id")
      .single();
    return created?.id as string;
  }

  // Resolve provided channel id: prefer external YouTube channel_id; if it's a UUID, allow id match
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let channel: any = null;
  const { data: byExternal } = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (byExternal?.id) {
    channel = byExternal;
  } else if (uuidPattern.test(channelId)) {
    const { data: byUuid } = await supabase
      .from("channels")
      .select("id")
      .eq("user_id", userId)
      .eq("id", channelId)
      .maybeSingle();
    if (byUuid?.id) channel = byUuid;
  }

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
    profile,
    stats,
    about,
    titles,
    strategy,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatPostBody;
    if (!body.message || (!body.threadId && !body.channelId)) {
      return NextResponse.json({ error: "message and threadId or channelId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });



    const threadId = body.threadId || (await getOrCreateThread(supabase, user.id, body.channelId));

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


