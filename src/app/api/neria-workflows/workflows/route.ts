import { NextResponse } from 'next/server';
import { listWorkflows, saveWorkflow } from '@/utils/neria-workflows/storage';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const workflows = await listWorkflows();
    return NextResponse.json({ workflows });
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


