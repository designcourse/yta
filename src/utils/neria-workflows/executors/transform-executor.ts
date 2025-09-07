import { BaseExecutor } from './base-executor';
import { WorkflowStep, ExecutionContext, TransformConfig } from '../types';

export class TransformExecutor extends BaseExecutor {
  async execute(
    step: WorkflowStep, 
    inputs: Record<string, any>, 
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    this.logStep(step.id, `Executing transform: ${step.name}`);
    
    const config = step.config as TransformConfig;
    
    if (!config.script) {
      throw new Error('Transform script is required');
    }

    try {
      // Create a safe execution context
      const safeContext = this.createSafeContext(inputs, context);
      
      // Create a function from the script
      const transformFunction = new Function(
        ...Object.keys(safeContext),
        config.script
      );

      // Execute the transform
      const result = transformFunction(...Object.values(safeContext));
      
      // Ensure result is an object
      if (typeof result !== 'object' || result === null) {
        throw new Error('Transform script must return an object');
      }

      return result;
    } catch (error) {
      throw new Error(`Transform execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createSafeContext(inputs: Record<string, any>, context: ExecutionContext): Record<string, any> {
    return {
      // Provide direct access to inputs
      ...inputs,
      
      // Provide utility functions
      Math: Math,
      Date: Date,
      JSON: JSON,
      
      // Provide context data
      steps: context.stepResults,
      workflowInputs: context.inputs,
      
      // Utility functions for common operations
      formatNumber: (num: number): string => {
        if (num >= 1000000) {
          return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
          return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
      },
      
      sortBy: <T>(array: T[], keyFn: (item: T) => any, reverse = false): T[] => {
        const sorted = [...array].sort((a, b) => {
          const aVal = keyFn(a);
          const bVal = keyFn(b);
          if (aVal < bVal) return reverse ? 1 : -1;
          if (aVal > bVal) return reverse ? -1 : 1;
          return 0;
        });
        return sorted;
      },
      
      groupBy: <T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> => {
        return array.reduce((groups, item) => {
          const key = keyFn(item);
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push(item);
          return groups;
        }, {} as Record<string, T[]>);
      },
      
      sum: (array: number[]): number => {
        return array.reduce((total, num) => total + num, 0);
      },
      
      average: (array: number[]): number => {
        return array.length > 0 ? array.reduce((total, num) => total + num, 0) / array.length : 0;
      },
      
      median: (array: number[]): number => {
        const sorted = [...array].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 
          ? (sorted[mid - 1] + sorted[mid]) / 2 
          : sorted[mid];
      },
    };
  }
}
