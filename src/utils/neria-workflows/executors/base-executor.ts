import { WorkflowStep, ExecutionContext } from '../types';

export abstract class BaseExecutor {
  abstract execute(
    step: WorkflowStep, 
    inputs: Record<string, any>, 
    context: ExecutionContext
  ): Promise<Record<string, any>>;

  protected validateInputs(step: WorkflowStep, inputs: Record<string, any>): void {
    // Override in subclasses for specific validation
  }

  protected logStep(stepId: string, message: string): void {
    console.log(`[Workflow Step ${stepId}] ${message}`);
  }
}
