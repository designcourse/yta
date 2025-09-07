import { createSupabaseServerClient } from '@/utils/supabase/server';
import { Workflow } from './types';
import { WorkflowNodeData } from '@/components/WorkflowEditor/WorkflowNode';

export interface StoredWorkflow {
  id: string;
  key: string;
  name: string;
  description?: string;
  version?: string;
  definition: Workflow;
  visual?: { nodes: WorkflowNodeData[] };
  created_at?: string;
  updated_at?: string;
}

const TABLE = 'neria_workflows';

export async function listWorkflows(): Promise<StoredWorkflow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('id,key,name,description,version,definition:definition_json,visual:visual_json,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as StoredWorkflow[];
}

export async function getWorkflow(idOrKey: string): Promise<StoredWorkflow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('id,key,name,description,version,definition:definition_json,visual:visual_json,created_at,updated_at')
    .or(`id.eq.${idOrKey},key.eq.${idOrKey}`)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return (data as unknown as StoredWorkflow) || null;
}

export async function saveWorkflow(payload: {
  id?: string;
  key: string;
  name: string;
  description?: string;
  version?: string;
  definition: Workflow;
  visual?: { nodes: WorkflowNodeData[] };
}): Promise<StoredWorkflow> {
  const supabase = await createSupabaseServerClient();
  const upsertRow = {
    id: payload.id,
    key: payload.key,
    name: payload.name,
    description: payload.description,
    version: payload.version || '1.0.0',
    definition_json: payload.definition,
    visual_json: payload.visual || null,
  };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(upsertRow, { onConflict: 'key' })
    .select('id,key,name,description,version,definition:definition_json,visual:visual_json,created_at,updated_at')
    .single();
  if (error) throw error;
  return data as unknown as StoredWorkflow;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}


