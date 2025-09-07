import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Load workflow system status
    const workflows = await import('@/utils/neria-workflows/workflows');
    const workflowCount = Object.keys(workflows.default).length;

    // Test workflow engine instantiation
    const { NeriaWorkflowEngine } = await import('@/utils/neria-workflows/engine');
    const engine = new NeriaWorkflowEngine();

    const status = {
      system: 'Neria Workflow Engine',
      version: '1.0.0',
      status: 'operational',
      workflows: {
        available: workflowCount,
        loaded: Object.keys(workflows.default),
      },
      executors: {
        available: ['youtube-api', 'openai', 'transform', 'parallel', 'condition'],
        status: 'ready'
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('Workflow status error:', error);
    
    return NextResponse.json({
      system: 'Neria Workflow Engine',
      version: '1.0.0',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
