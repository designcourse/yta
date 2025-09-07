import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { NeriaWorkflowEngine } from '@/utils/neria-workflows/engine';

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Test workflow engine with a simple transform workflow
    const testWorkflow = {
      id: 'test-workflow',
      name: 'Test Workflow',
      version: '1.0.0',
      description: 'Simple test workflow',
      triggers: [{ type: 'manual' as const, config: {} }],
      steps: [
        {
          id: 'test-transform',
          type: 'transform' as const,
          name: 'Test Transform',
          config: {
            script: `
              return {
                message: "Workflow system is working!",
                input: testInput,
                timestamp: new Date().toISOString(),
                calculations: {
                  sum: sum([1, 2, 3, 4, 5]),
                  average: average([10, 20, 30]),
                  formatted: formatNumber(1234567)
                }
              };
            `
          },
          inputs: {
            testInput: '$input.testValue'
          },
          outputs: ['message', 'input', 'timestamp', 'calculations'],
          dependencies: []
        }
      ]
    };

    // Temporarily inject test workflow
    const workflows = await import('@/utils/neria-workflows/workflows');
    workflows.default['test-workflow'] = testWorkflow;

    // Execute test workflow
    const engine = new NeriaWorkflowEngine();
    const execution = await engine.executeWorkflow('test-workflow', {
      testValue: 'Hello from workflow test!',
      userId: user.id,
    });

    // Clean up test workflow
    delete workflows.default['test-workflow'];

    return NextResponse.json({
      success: true,
      execution,
      message: 'Workflow system test completed successfully'
    });

  } catch (error) {
    console.error('Workflow test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Workflow system test failed'
    }, { status: 500 });
  }
}
