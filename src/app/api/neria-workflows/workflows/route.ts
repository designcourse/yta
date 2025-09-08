import { NextResponse } from 'next/server';
import { listWorkflows, saveWorkflow } from '@/utils/neria-workflows/storage';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import staticWorkflows from '@/utils/neria-workflows/workflows';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get database-stored workflows
    const dbWorkflows = await listWorkflows();
    
    // Convert static workflows to the same format
    const staticWorkflowList = Object.values(staticWorkflows).map(workflow => ({
      id: workflow.id,
      key: workflow.id,
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      definition: workflow,
      visual: null, // Static workflows don't have visual data yet
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Combine both sources, with database workflows taking precedence.
    // Deduplicate by key (not id), because DB rows have UUID ids while static use the workflow key.
    const combined = [...dbWorkflows, ...staticWorkflowList];
    const seenByKey = new Set<string>();
    const uniqueWorkflows = combined.filter(w => {
      const key = (w as any).key || w.id;
      if (seenByKey.has(key)) return false;
      seenByKey.add(key);
      return true;
    });

    return NextResponse.json({ workflows: uniqueWorkflows });
  } catch (e: any) {
    console.error('[WorkflowsAPI][GET] Error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const saved = await saveWorkflow(body);
    return NextResponse.json({ workflow: saved });
  } catch (e: any) {
    console.error('[WorkflowsAPI][POST] Error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


