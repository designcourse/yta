import { BaseExecutor } from './base-executor';
import { WorkflowStep, ExecutionContext, ParallelConfig } from '../types';
import type { NeriaWorkflowEngine } from '../engine';

export class ParallelExecutor extends BaseExecutor {
  constructor(private engine: NeriaWorkflowEngine) {
    super();
  }

  async execute(
    step: WorkflowStep, 
    inputs: Record<string, any>, 
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    this.logStep(step.id, `Executing parallel steps: ${step.name}`);
    
    const config = step.config as ParallelConfig;
    
    if (!config.steps || config.steps.length === 0) {
      throw new Error('Parallel executor requires steps configuration');
    }

    // Execute all parallel steps simultaneously
    const results = await Promise.all(
      config.steps.map(async (parallelStep) => {
        const stepWithInputs = {
          ...parallelStep,
          inputs: { ...inputs, ...parallelStep.inputs },
        };
        
        return this.engine.executeStep(stepWithInputs, context);
      })
    );

    // Check for failures
    const failures = results.filter(result => result.status === 'failed');
    if (failures.length > 0) {
      const errorMessages = failures.map(f => `${f.stepId}: ${f.error}`).join(', ');
      throw new Error(`Parallel step failures: ${errorMessages}`);
    }

    // Combine all outputs
    const combinedOutputs: Record<string, any> = {};
    results.forEach(result => {
      Object.assign(combinedOutputs, result.outputs);
    });

    return combinedOutputs;
  }
}
