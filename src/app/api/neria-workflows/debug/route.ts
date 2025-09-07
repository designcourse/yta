import { NextRequest, NextResponse } from 'next/server';
import { executionStore } from '@/utils/neria-workflows/execution-store';

export async function GET(request: NextRequest) {
  try {
    const executions = executionStore.getExecutions(10);
    const stats = executionStore.getStats();
    
    return NextResponse.json({
      debug: true,
      timestamp: new Date().toISOString(),
      executionCount: executions.length,
      stats,
      executions: executions.map(e => ({
        id: e.id,
        workflowId: e.workflowId,
        status: e.status,
        startTime: e.startTime,
        endTime: e.endTime,
        stepCount: Object.keys(e.stepResults).length,
        errorCount: e.errors.length,
      })),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
