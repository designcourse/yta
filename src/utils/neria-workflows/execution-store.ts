import { WorkflowExecution, WorkflowStep, StepResult } from './types';

// In-memory execution store (in production, this would be in a database)
// Using singleton pattern to ensure single instance across all imports
class ExecutionStore {
  private executions = new Map<string, WorkflowExecution>();
  private executionHistory: WorkflowExecution[] = [];
  private maxHistorySize = 100;

  storeExecution(execution: WorkflowExecution): void {
    console.log('[ExecutionStore] Storing execution:', execution.id, execution.status);
    this.executions.set(execution.id, execution);
    
    // Add to history
    this.executionHistory.unshift(execution);
    
    // Keep only the most recent executions
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(0, this.maxHistorySize);
    }
    
    console.log('[ExecutionStore] Total executions in history:', this.executionHistory.length);
  }

  updateExecution(executionId: string, updates: Partial<WorkflowExecution>): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      Object.assign(execution, updates);
      
      // Update in history as well
      const historyIndex = this.executionHistory.findIndex(e => e.id === executionId);
      if (historyIndex !== -1) {
        Object.assign(this.executionHistory[historyIndex], updates);
      }
    }
  }

  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  getExecutions(limit = 50): WorkflowExecution[] {
    console.log('[ExecutionStore] Getting executions, total in history:', this.executionHistory.length);
    return this.executionHistory.slice(0, limit);
  }

  getExecutionsByWorkflow(workflowId: string, limit = 20): WorkflowExecution[] {
    return this.executionHistory
      .filter(e => e.workflowId === workflowId)
      .slice(0, limit);
  }

  getActiveExecutions(): WorkflowExecution[] {
    return this.executionHistory.filter(e => e.status === 'running');
  }

  clearHistory(): void {
    this.executionHistory = [];
    this.executions.clear();
  }

  getStats() {
    const total = this.executionHistory.length;
    const completed = this.executionHistory.filter(e => e.status === 'completed').length;
    const failed = this.executionHistory.filter(e => e.status === 'failed').length;
    const running = this.executionHistory.filter(e => e.status === 'running').length;

    const avgDuration = this.executionHistory
      .filter(e => e.endTime && e.status === 'completed')
      .reduce((sum, e) => sum + (e.endTime!.getTime() - e.startTime.getTime()), 0) / Math.max(completed, 1);

    return {
      total,
      completed,
      failed,
      running,
      successRate: total > 0 ? (completed / total * 100).toFixed(1) : '0',
      avgDuration: Math.round(avgDuration),
    };
  }
}

// Global instance that persists across API routes
declare global {
  var __neriaExecutionStore: ExecutionStore | undefined;
}

// Use global variable to ensure single instance across all API routes
export const executionStore = (() => {
  if (!global.__neriaExecutionStore) {
    console.log('[ExecutionStore] Creating new global execution store instance');
    global.__neriaExecutionStore = new ExecutionStore();
  }
  return global.__neriaExecutionStore;
})();
