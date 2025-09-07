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

    // Load all available workflows
    const workflows = await import('@/utils/neria-workflows/workflows');
    const workflowList = Object.values(workflows.default).map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      triggers: workflow.triggers,
      stepCount: workflow.steps.length,
    }));

    return NextResponse.json({
      workflows: workflowList,
      total: workflowList.length,
    });
  } catch (error) {
    console.error('Workflows listing error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to list workflows',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
