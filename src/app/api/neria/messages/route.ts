import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

// Import shared functions from chat route
async function getCurrentModel(supabase: any) {
  const { data: settings } = await supabase
    .from("model_settings")
    .select("current_model_id")
    .single();
  
  if (!settings?.current_model_id) {
    return {
      provider: "perplexity",
      model: "llama-3.1-sonar-large-128k-online",
      max_input_tokens: 127072,
      max_output_tokens: 8192
    };
  }

  const { data: modelProvider } = await supabase
    .from("model_providers")
    .select("provider, model, max_input_tokens, max_output_tokens")
    .eq("id", settings.current_model_id)
    .single();

  return modelProvider || {
    provider: "perplexity",
    model: "llama-3.1-sonar-large-128k-online",
    max_input_tokens: 127072,
    max_output_tokens: 8192
  };
}

function countTokens(messages: Array<{ role: string; content: string }>, model: string): number {
  // Calculate total character length for debugging
  const totalChars = messages.reduce((acc, msg) => acc + msg.role.length + msg.content.length, 0);
  console.log(`Token counting - Model: ${model}, Messages: ${messages.length}, Total chars: ${totalChars}`);
  
  try {
    // Use tiktoken for accurate token counting when available
    const { encoding_for_model } = require('tiktoken');
    
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

async function loadPinnedContext(supabase: any, userId: string, threadId: string) {
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("channel_id")
    .eq("id", threadId)
    .single();

  const channelId = thread?.channel_id as string | undefined;

  let channelMeta: { title?: string; externalId?: string } | null = null;
  if (channelId) {
    const { data: ch } = await supabase
      .from("channels")
      .select("title, channel_id")
      .eq("id", channelId)
      .maybeSingle();
    if (ch) channelMeta = { title: ch.title || undefined, externalId: ch.channel_id };
  }

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");
    const channelIdParam = searchParams.get("channelId");
    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Ensure thread belongs to user (and matches channel if provided)
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("id, channel_id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

    if (channelIdParam) {
      console.log('Messages API: Validating thread', threadId, 'for channel', channelIdParam);
      console.log('Messages API: Thread data:', thread);
      
      // Resolve external YouTube id to internal channel uuid
      const { data: ch } = await supabase
        .from("channels")
        .select("id")
        .eq("user_id", user.id)
        .eq("channel_id", channelIdParam)  // Look for YouTube channel ID
        .limit(1)
        .maybeSingle();

      console.log('Messages API: Channel lookup result:', ch);
      console.log('Messages API: Comparing thread.channel_id', thread.channel_id, 'with ch.id', ch?.id);

      if (!ch?.id || thread.channel_id !== ch.id) {
        console.log('Messages API: Validation failed - returning 400');
        return NextResponse.json({ error: "Thread does not belong to requested channel" }, { status: 400 });
      }
      
      console.log('Messages API: Validation passed');
    }

    const { data: messages } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    // Calculate context percentage for existing messages
    let contextPercentage = 0;
    if (messages && messages.length > 0) {
      try {
        const modelConfig = await getCurrentModel(supabase);
        const pinned = await loadPinnedContext(supabase, user.id, threadId);
        const systemPrompt = buildSystemPrompt(pinned);
        
        // Build the message array as it would be for a new chat request
        const messageArray: Array<{ role: string; content: string }> = [];
        messageArray.push({ role: "system", content: systemPrompt });
        
        // Add recent messages (limit to last 12 like in chat route)
        const recentMessages = messages.slice(-12);
        for (const m of recentMessages) {
          messageArray.push({ role: m.role, content: m.content });
        }
        
        const inputTokens = countTokens(messageArray, modelConfig.model);
        const maxTokens = modelConfig.max_input_tokens - modelConfig.max_output_tokens;
        contextPercentage = Math.min(100, Math.ceil((inputTokens / maxTokens) * 100));
      } catch (error) {
        console.warn("Failed to calculate context percentage:", error);
      }
    }

    return NextResponse.json({ 
      messages: messages || [], 
      contextPercentage 
    });
  } catch (e: any) {
    console.error("List messages error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


