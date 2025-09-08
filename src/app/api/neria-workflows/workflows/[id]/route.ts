import { NextResponse } from 'next/server';
import { getWorkflow, saveWorkflow, deleteWorkflow } from '@/utils/neria-workflows/storage';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import staticWorkflows from '@/utils/neria-workflows/workflows';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    
    // First, check if it's a static workflow
    const staticWorkflow = staticWorkflows[id];
    if (staticWorkflow) {
      // Convert to the same format as database workflows
      const workflowData = {
        id: staticWorkflow.id,
        key: staticWorkflow.id,
        name: staticWorkflow.name,
        description: staticWorkflow.description,
        version: staticWorkflow.version,
        definition: staticWorkflow,
        visual: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return NextResponse.json({ workflow: workflowData });
    }
    
    // If not a static workflow, try database
    const workflow = await getWorkflow(id);
    if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ workflow });
  } catch (e: any) {
    console.error('[WorkflowAPI][GET] Error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const body = await req.json();
    
    // Check if this is a static workflow being edited for the first time
    const staticWorkflows = await import('@/utils/neria-workflows/workflows');
    const isStaticWorkflow = staticWorkflows.default[id];
    
    // For static workflows, don't pass the string ID - let the database generate a UUID
    let savePayload;
    if (isStaticWorkflow) {
      // Don't pass id at all for static workflows, use the string as key
      const { id: _, ...bodyWithoutId } = body;
      savePayload = { ...bodyWithoutId, key: id };
    } else {
      // Use the UUID for database workflows
      savePayload = { ...body, id };
    }
    
    const saved = await saveWorkflow(savePayload);
    return NextResponse.json({ workflow: saved });
  } catch (e: any) {
    console.error('[WorkflowAPI][PUT] Error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    await deleteWorkflow(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[WorkflowAPI][DELETE] Error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


