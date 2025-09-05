import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getPrompt } from '@/utils/prompts';
import { getValidAccessToken } from '@/utils/googleAuth';

// Simple token counting function (approximation)
async function countTokens(messages: Array<{ role: string; content: string }>, model: string): Promise<number> {
  // Calculate total character length for debugging
  const totalChars = messages.reduce((acc, msg) => acc + msg.role.length + msg.content.length, 0);
  console.log(`Token counting - Model: ${model}, Messages: ${messages.length}, Total chars: ${totalChars}`);
  
  try {
    // Try to use tiktoken for accurate token counting when available
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
      // Each message has some overhead tokens for role and structure
      totalTokens += 4; // Message overhead
      totalTokens += encoding.encode(message.role).length;
      totalTokens += encoding.encode(message.content).length;
    }
    
    // Add some tokens for the overall structure
    totalTokens += 2;
    
    encoding.free();
    console.log(`Accurate token count: ${totalTokens}`);
    return totalTokens;
  } catch (error) {
    console.warn('Failed to use tiktoken, falling back to character-based estimation:', error);
    // Fallback: rough estimation (1 token ≈ 4 characters for English text)
    const estimatedTokens = Math.ceil(totalChars / 4);
    console.log(`Estimated token count: ${estimatedTokens}`);
    return estimatedTokens;
  }
}

// This is a copy of the buildSystemPrompt function from the chat route
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
  const clean = (v?: string) => (v || "").replace(/^\s*(Goals?:|Preferences?:|Constraints?:)\s*/i, "").trim();
  const goals = clean(context.memoryProfile?.goals);
  const prefs = clean(context.memoryProfile?.preferences);
  const cons = clean(context.memoryProfile?.constraints);
  const profileLines = [
    goals ? `User Goals: ${goals}` : "",
    prefs ? `Preferences: ${prefs}` : "",
    cons ? `Constraints: ${cons}` : "",
  ].filter(Boolean);
  const profile = profileLines.length ? profileLines.join("\n") : "";
  const stats = context.statsSummary ? `Latest Stats: ${context.statsSummary}` : "";
  const about = context.aboutText ? `About: ${context.aboutText}` : "";
  const uniqueTitles = Array.from(new Set((context.recentTitles || []).map(t => (t || "").trim())));
  const titles = uniqueTitles.length ? `Recent Titles: ${uniqueTitles.slice(0, 6).join(", ")}` : "";
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

// Copy of loadRecentMessages function from chat route
async function loadRecentMessages(supabase: any, threadId: string, limit = 12) {
  const { data: msgs, error } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) return [];

  const all = msgs || [];
  const recent = all.slice(Math.max(0, all.length - limit));
  return recent.map((m: any) => ({ role: m.role, content: m.content }));
}

// Copy of loadPinnedContext function from messages route
async function loadPinnedContext(supabase: any, userId: string, threadId: string) {
  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .select("channel_id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .single();

  if (threadError || !thread?.channel_id) {
    return { channelMeta: null, memoryProfile: null, statsSummary: null, aboutText: "", recentTitles: [], strategyPlan: null };
  }

  const channelUuid = thread.channel_id;

  // Get channel metadata
  const { data: channelMeta } = await supabase
    .from("channels")
    .select("title, channel_id")
    .eq("id", channelUuid)
    .eq("user_id", userId)
    .single();

  // Get memory profile
  const { data: memoryProfile } = await supabase
    .from("memory_profile")
    .select("goals, preferences, constraints")
    .eq("user_id", userId)
    .eq("channel_id", channelUuid)
    .maybeSingle();

  // Get latest stats summary and enrich with retention checkpoints
  const { data: statsRows } = await supabase
    .from("latest_video_snapshots")
    .select("video_title, view_count, comment_count, published_at, video_id")
    .eq("channel_id", channelUuid)
    .order("published_at", { ascending: false })
    .limit(1);

  let statsSummary = null as string | null;
  if (statsRows && statsRows.length > 0) {
    const latest = statsRows[0] as any;
    let retentionLine = "";
    try {
      if (channelMeta?.channel_id && latest.video_id) {
        const tokenResult = await getValidAccessToken(userId, channelMeta.channel_id);
        if (tokenResult?.success && tokenResult.accessToken) {
          const endDate = new Date().toISOString().slice(0, 10);
          const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const params = new URLSearchParams({
            ids: `channel==${channelMeta.channel_id}`,
            startDate,
            endDate,
            metrics: 'relativeRetentionPerformance',
            dimensions: 'elapsedVideoTimeRatio',
            filters: `video==${latest.video_id}`,
            sort: 'elapsedVideoTimeRatio',
          });
          let res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
            headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
          });
          if (!res.ok) {
            const alt = new URLSearchParams(params);
            alt.set('ids', 'channel==MINE');
            res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${alt.toString()}`, {
              headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
            });
          }
          if (res.ok) {
            const table = await res.json();
            const rows = Array.isArray(table?.rows) ? table.rows : [];
            const getVal = (pct: number) => {
              const label = `${pct}%`;
              const exact = rows.find((r: any[]) => r?.[0] === label);
              if (exact && typeof exact[1] === 'number') return exact[1];
              const toNum = (s: string) => Number(String(s || '').replace('%',''));
              let best: {diff:number,row:any[]}|undefined;
              for (const r of rows) {
                const diff = Math.abs(toNum(r?.[0]) - pct);
                if (!best || diff < best.diff) best = { diff, row: r };
              }
              return best && typeof best.row?.[1] === 'number' ? best.row[1] : undefined;
            };
            const r25 = getVal(25);
            const r50 = getVal(50);
            const r75 = getVal(75);
            const parts: string[] = [];
            if (typeof r25 === 'number') parts.push(`rel@25% ${r25.toFixed(2)}`);
            if (typeof r50 === 'number') parts.push(`50% ${r50.toFixed(2)}`);
            if (typeof r75 === 'number') parts.push(`75% ${r75.toFixed(2)}`);
            if (parts.length) retentionLine = ` | Retention: ${parts.join(', ')}`;
          }
        }
      }
    } catch {}

    statsSummary = `Latest Video: "${latest.video_title}" - ${latest.view_count} views, ${latest.comment_count} comments (published ${latest.published_at})${retentionLine}`;
  }

  // Get about text from neria_context
  const { data: aboutRows } = await supabase
    .from("neria_context")
    .select("prompt_text")
    .eq("channel_id", channelUuid)
    .eq("prompt_type", "about_text");

  const aboutText = aboutRows?.[0]?.prompt_text || "";

  // Get recent titles
  let recentTitles: string[] = [];
  const { data: titlesRows } = await supabase
    .from("neria_context")
    .select("prompt_text")
    .eq("channel_id", channelUuid)
    .eq("prompt_type", "recent_video_titles");

  if (titlesRows?.[0]?.prompt_text) {
    try {
      recentTitles = JSON.parse(titlesRows[0].prompt_text);
    } catch {}
  }

  // Get strategy plan
  const { data: strategyRows } = await supabase
    .from("channel_strategy")
    .select("strategy_content")
    .eq("user_id", userId)
    .eq("channel_id", channelUuid)
    .order("created_at", { ascending: false })
    .limit(1);

  const strategyPlan = strategyRows?.[0]?.strategy_content || null;

  return {
    channelMeta: channelMeta ? { title: channelMeta.title, externalId: channelMeta.channel_id } : null,
    memoryProfile,
    statsSummary,
    aboutText,
    recentTitles,
    strategyPlan
  };
}

async function checkIsAdmin(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data: roleRow } = await supabase
      .from('google_accounts')
      .select('role_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    const { data: roles } = await supabase.from('user_roles').select('id,name');
    const adminRoleId = roles?.find((r: any) => r.name === 'admin')?.id;
    
    return !!adminRoleId && roleRow?.role_id === adminRoleId;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const { threadId, channelId } = await request.json();
    
    if (!threadId || !channelId) {
      return NextResponse.json({ error: 'threadId and channelId are required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user is admin
    const isAdmin = await checkIsAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Load the same context that would be used in a chat request
    const pinned = await loadPinnedContext(supabase, user.id, threadId);
    const systemPrompt = await buildSystemPrompt(pinned);
    const history = await loadRecentMessages(supabase, threadId);

    // Assemble messages like in the chat route
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    messages.push({ role: "system", content: systemPrompt });
    
    // Filter history to ensure proper user/assistant alternation
    const filteredHistory: Array<{ role: string; content: string }> = [];
    let lastRole: string | null = null;
    
    for (const m of history) {
      if (m.role === 'system') continue;
      
      if (m.role !== lastRole) {
        filteredHistory.push(m);
        lastRole = m.role;
      } else {
        if (filteredHistory.length > 0) {
          filteredHistory[filteredHistory.length - 1].content += "\n\n" + m.content;
        }
      }
    }
    
    if (filteredHistory.length > 0 && filteredHistory[0].role === 'assistant') {
      filteredHistory.shift();
    }
    
    if (filteredHistory.length > 0 && filteredHistory[filteredHistory.length - 1].role === 'user') {
      filteredHistory.pop();
    }
    
    for (const m of filteredHistory) messages.push({ role: m.role as any, content: m.content });

    // Calculate context usage
    const primaryModel = { model: 'gpt-4o', max_input_tokens: 128000, max_output_tokens: 8192 } as const;
    const inputTokens = await countTokens(messages, primaryModel.model);
    const maxTokens = primaryModel.max_input_tokens - primaryModel.max_output_tokens;
    const contextPercentage = Math.min(100, Math.ceil((inputTokens / maxTokens) * 100));

    // Return debug data
    return NextResponse.json({
      systemPrompt,
      messages,
      contextPercentage,
      inputTokens,
      maxTokens,
      model: primaryModel.model,
      ...pinned
    });

  } catch (error) {
    console.error('Debug context error:', error);
    return NextResponse.json({ error: 'Failed to fetch debug context' }, { status: 500 });
  }
}
