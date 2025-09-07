import { NextResponse } from 'next/server';
import { getWorkflow, saveWorkflow, deleteWorkflow } from '@/utils/neria-workflows/storage';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
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

    const body = await req.json();
    const { id } = await ctx.params;
    const saved = await saveWorkflow({ ...body, id });
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


