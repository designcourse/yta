import { NextRequest, NextResponse } from 'next/server';
import { NeriaWorkflowEngine } from '@/utils/neria-workflows/engine';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await params;
    const { inputs } = await request.json();

    // Get user session
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate required inputs
    if (!inputs.accessToken || !inputs.channelId) {
      return NextResponse.json(
        { error: 'Missing required inputs: accessToken and channelId' },
        { status: 400 }
      );
    }

    // Add user context to inputs
    const contextualInputs = {
      ...inputs,
      userId: user.id,
    };

    // Execute workflow
    const engine = new NeriaWorkflowEngine();
    const execution = await engine.executeWorkflow(workflowId, contextualInputs);

    // Return the execution result
    return NextResponse.json(execution);
  } catch (error) {
    console.error('Workflow execution error:', error);
    
    return NextResponse.json(
      { 
        error: 'Workflow execution failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await params;

    // Load workflow definition
    const workflows = await import('@/utils/neria-workflows/workflows');
    const workflow = workflows.default[workflowId];
    
    if (!workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(workflow);
  } catch (error) {
    console.error('Workflow retrieval error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to retrieve workflow',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
