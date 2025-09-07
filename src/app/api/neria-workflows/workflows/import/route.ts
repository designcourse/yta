import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import registry from '@/utils/neria-workflows/workflows';
import { saveWorkflow } from '@/utils/neria-workflows/storage';

async function importAll() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const entries = Object.entries(registry);
    const results = [] as any[];
    for (const [key, definition] of entries) {
      const saved = await saveWorkflow({
        key,
        name: definition.name || key,
        description: definition.description,
        version: definition.version,
        definition,
        visual: null as any,
      });
      results.push({ id: saved.id, key: saved.key, name: saved.name });
    }

    return NextResponse.json({ imported: results.length, workflows: results });
  } catch (e: any) {
    console.error('[WorkflowsImportAPI][POST] Error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST() {
  return importAll();
}

// Convenience: allow GET in browser address bar
export async function GET() {
  return importAll();
}


