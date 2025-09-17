import type { SupabaseClient } from '@supabase/supabase-js';

type Json = Record<string, any> | null | undefined;

function safeTruncate(text: string | null | undefined, max = 4000): string | null {
  if (!text) return null;
  const cleaned = text.replace(/(sk-[A-Za-z0-9-_]{10,})/g, '[redacted]')
    .replace(/(AIza[0-9A-Za-z\-_]{35})/g, '[redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,7}/g, '[redacted-email]');
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

export async function logAi(
  supabase: SupabaseClient,
  params: {
    userId: string;
    channelId?: string | null; // internal UUID if available
    endpoint: string;
    provider?: string | null;
    model?: string | null;
    traceId?: string | null;
    input?: Json;
    output?: Json;
    outputText?: string | null;
    latencyMs?: number | null;
    ok?: boolean;
    error?: string | null;
  }
): Promise<void> {
  try {
    const payload: Record<string, any> = {
      user_id: params.userId,
      channel_id: params.channelId || null,
      endpoint: params.endpoint,
      provider: params.provider || null,
      model: params.model || null,
      trace_id: params.traceId || null,
      input: params.input ? params.input : null,
      output: params.output ? params.output : null,
      output_text: safeTruncate(params.outputText || null),
      latency_ms: params.latencyMs ?? null,
      ok: params.ok !== false,
      error: params.error || null,
    };
    await supabase.from('ai_logs').insert(payload);
  } catch (e) {
    // Best-effort logging only
    // eslint-disable-next-line no-console
    console.warn('[logAi] failed to insert log', e);
  }
}

export async function logAnalytics(
  supabase: SupabaseClient,
  params: {
    userId: string;
    channelId: string; // external YouTube channel id or internal UUID depending on table; analytics_logs.channel_id is text
    videoId?: string | null;
    comparable?: Json;
    baselines?: Json;
    current?: Json;
    verdicts?: Json;
    goals?: Json;
    sampleSize?: number | null;
  }
): Promise<void> {
  try {
    const row: Record<string, any> = {
      user_id: params.userId,
      channel_id: params.channelId,
      video_id: params.videoId || null,
      comparable: params.comparable || null,
      baselines: params.baselines || null,
      current: params.current || null,
      verdicts: params.verdicts || null,
      goals: params.goals || null,
      sample_size: params.sampleSize ?? null,
    };
    await supabase.from('analytics_logs').insert(row);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[logAnalytics] failed to insert log', e);
  }
}


