import OpenAI, { toFile } from 'openai';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getClient } from '@/utils/openai';

/**
 * Minimal OpenAI-managed context utilities for Neria.
 * - Creates one vector store per channel (stored in neria_context as prompt_type='openai_vector_store_id')
 * - Uploads small, structured "facts" documents and attaches them to the vector store
 */

export async function ensureVectorStoreForChannel(channelInternalId: string): Promise<string> {
  const admin = createSupabaseAdminClient();

  // Reuse neria_context as a light key/value store to avoid a migration right now
  const { data: existing } = await admin
    .from('neria_context')
    .select('prompt_text')
    .eq('channel_id', channelInternalId)
    .eq('prompt_type', 'openai_vector_store_id')
    .maybeSingle();

  const client = getClient('openai') as OpenAI;

  if (existing?.prompt_text) return existing.prompt_text as string;

  // Create a new vector store
  const vs = await (client as any).beta.vector_stores.create({
    name: `neria-${channelInternalId.slice(0, 8)}`,
  });

  const vectorStoreId: string = vs.id;

  await admin.from('neria_context').upsert(
    {
      channel_id: channelInternalId,
      prompt_type: 'openai_vector_store_id',
      prompt_text: vectorStoreId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'channel_id,prompt_type' }
  );

  return vectorStoreId;
}

export interface FactsDoc {
  kind: 'kpis_24h' | 'insights_48h' | 'channel_snapshot';
  channelId: string; // external id
  internalChannelId: string; // UUID
  videoId?: string;
  timestamp: string;
  content: Record<string, unknown>;
}

export async function uploadFactsDocToVectorStore(vectorStoreId: string, doc: FactsDoc): Promise<string> {
  const client = getClient('openai') as OpenAI;

  const json = JSON.stringify(doc, null, 2);
  const file = await (client as any).files.create({
    file: await toFile(Buffer.from(json), `${doc.kind}-${doc.videoId || 'channel'}.json`),
    purpose: 'assistants',
  });

  // Index the file into the vector store
  await (client as any).beta.vector_stores.files.createAndPoll(
    {
      vector_store_id: vectorStoreId,
      file_id: file.id,
    }
  );

  return file.id as string;
}


