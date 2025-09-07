import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { executionStore } from '@/utils/neria-workflows/execution-store';

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin access (you can customize this logic)
    // For now, we'll allow all authenticated users
    
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const workflowId = url.searchParams.get('workflowId');
    const status = url.searchParams.get('status');

    let executions = workflowId 
      ? executionStore.getExecutionsByWorkflow(workflowId, limit)
      : executionStore.getExecutions(limit);

    // Filter by status if provided
    if (status) {
      executions = executions.filter(e => e.status === status);
    }

    const stats = executionStore.getStats();
    
    console.log('[ExecutionsAPI] Returning executions:', {
      count: executions.length,
      stats: stats.total,
      requestedLimit: limit,
      workflowId,
      status
    });

    return NextResponse.json({
      executions,
      stats,
      total: executions.length,
    });
  } catch (error) {
    console.error('Executions API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch executions',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
