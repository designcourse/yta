import { StepExecutor, StepResult, ExecutionContext } from '../types';
import { NeriaWorkflowEngine } from '../engine';

export class WorkflowExecutor implements StepExecutor {
  constructor(private engine: NeriaWorkflowEngine) {}

  async execute(
    step: any,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    console.log(`[Workflow Step ${step.id}] Executing sub-workflow: ${step.config.workflowId}`);
    
    try {
      const workflowId = step.config.workflowId;
      
      if (!workflowId) {
        throw new Error('workflowId is required for workflow steps');
      }

      // Execute the sub-workflow with the provided inputs
      const execution = await this.engine.executeWorkflow(workflowId, inputs);
      
      if (execution.status === 'failed') {
        throw new Error(`Sub-workflow ${workflowId} failed: ${execution.errors?.map(e => e.message).join(', ')}`);
      }

      // Extract the result from the sub-workflow execution
      // Look for a step that outputs 'result' or use the last step's output
      let result = null;
      
      // Try to find a step with 'result' output
      for (const [stepId, stepResult] of Object.entries(execution.stepResults)) {
        if (stepResult && typeof stepResult === 'object' && 'result' in stepResult) {
          result = (stepResult as any).result;
          break;
        }
      }
      
      // If no 'result' found, use the last step's output
      if (!result) {
        const stepIds = Object.keys(execution.stepResults);
        const lastStepId = stepIds[stepIds.length - 1];
        result = execution.stepResults[lastStepId];
      }

      // Return the result with the first output key from the step definition
      const outputKey = step.outputs[0] || 'result';
      return {
        [outputKey]: result
      };

    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Unknown workflow execution error');
    }
  }
}
