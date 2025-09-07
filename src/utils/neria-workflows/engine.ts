import { 
  Workflow, 
  WorkflowExecution, 
  WorkflowStep, 
  StepResult, 
  ExecutionContext, 
  DependencyGraph,
  WorkflowError 
} from './types';
import { executionStore } from './execution-store';
import { YouTubeApiExecutor } from './executors/youtube-api-executor';
import { OpenAIExecutor } from './executors/openai-executor';
import { TransformExecutor } from './executors/transform-executor';
import { ParallelExecutor } from './executors/parallel-executor';

export class NeriaWorkflowEngine {
  private executors = {
    'youtube-api': new YouTubeApiExecutor(),
    'openai': new OpenAIExecutor(),
    'transform': new TransformExecutor(),
    'parallel': new ParallelExecutor(this),
    'condition': new TransformExecutor(), // Use transform executor for conditions
  };

  async executeWorkflow(workflowId: string, inputs: Record<string, any>): Promise<WorkflowExecution> {
    const workflow = await this.loadWorkflow(workflowId);
    const executionId = this.generateExecutionId();
    
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      startTime: new Date(),
      stepResults: {},
      errors: [],
    };

    // Store initial execution
    executionStore.storeExecution(execution);

    try {
      const dependencyGraph = this.buildDependencyGraph(workflow);
      const context: ExecutionContext = {
        workflowId,
        executionId,
        stepResults: {},
        inputs,
      };

      await this.executeStepsInOrder(workflow.steps, dependencyGraph, context);
      
      execution.status = 'completed';
      execution.stepResults = context.stepResults;
      execution.endTime = new Date();
      
      // Update stored execution
      executionStore.updateExecution(executionId, {
        status: 'completed',
        stepResults: context.stepResults,
        endTime: execution.endTime,
      });
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.errors.push({
        stepId: 'workflow',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Update stored execution
      executionStore.updateExecution(executionId, {
        status: 'failed',
        endTime: execution.endTime,
        errors: execution.errors,
      });
    }

    return execution;
  }

  async executeStep(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const startTime = Date.now();
    
    try {
      const resolvedInputs = await this.resolveInputs(step, context);
      const executor = this.executors[step.type];
      
      if (!executor) {
        throw new Error(`No executor found for step type: ${step.type}`);
      }

      const outputs = await executor.execute(step, resolvedInputs, context);
      
      return {
        stepId: step.id,
        status: 'completed',
        outputs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        stepId: step.id,
        status: 'failed',
        outputs: {},
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      };
    }
  }

  async resolveInputs(step: WorkflowStep, context: ExecutionContext): Promise<Record<string, any>> {
    const resolved: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(step.inputs)) {
      resolved[key] = this.resolveValue(value, context);
    }
    
    return resolved;
  }

  private resolveValue(value: any, context: ExecutionContext): any {
    if (typeof value === 'string') {
      // Handle $input.* references
      if (value.startsWith('$input.')) {
        const path = value.substring(7);
        return this.getNestedValue(context.inputs, path);
      }
      
      // Handle $steps.* references
      if (value.startsWith('$steps.')) {
        const path = value.substring(7);
        return this.getNestedValue(context.stepResults, path);
      }
      
      // Handle template strings with {{}} syntax
      return value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        if (path.startsWith('input.')) {
          return this.getNestedValue(context.inputs, path.substring(6));
        }
        if (path.startsWith('steps.')) {
          return this.getNestedValue(context.stepResults, path.substring(6));
        }
        return match;
      });
    }
    
    return value;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (key.includes('*')) {
        // Handle array expansion like videoDetails.*.title
        const [arrayPath, ...rest] = key.split('*');
        const array = current[arrayPath.slice(0, -1)]; // Remove trailing dot
        if (Array.isArray(array)) {
          return array.map(item => rest.length > 0 ? 
            this.getNestedValue(item, rest.join('*').substring(1)) : item
          );
        }
        return undefined;
      }
      return current?.[key];
    }, obj);
  }

  private buildDependencyGraph(workflow: Workflow): DependencyGraph {
    const nodes = workflow.steps.map(step => step.id);
    const edges = new Map<string, string[]>();
    const levels = new Map<string, number>();

    // Build edges
    workflow.steps.forEach(step => {
      edges.set(step.id, step.dependencies || []);
    });

    // Calculate levels (topological sort)
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (nodeId: string): number => {
      if (temp.has(nodeId)) {
        throw new Error(`Circular dependency detected involving step: ${nodeId}`);
      }
      if (visited.has(nodeId)) {
        return levels.get(nodeId) || 0;
      }

      temp.add(nodeId);
      
      const dependencies = edges.get(nodeId) || [];
      const maxDepLevel = dependencies.length > 0 ? 
        Math.max(...dependencies.map(dep => visit(dep))) : -1;
      
      const level = maxDepLevel + 1;
      levels.set(nodeId, level);
      
      temp.delete(nodeId);
      visited.add(nodeId);
      
      return level;
    };

    nodes.forEach(node => visit(node));

    return { nodes, edges, levels };
  }

  private async executeStepsInOrder(
    steps: WorkflowStep[], 
    graph: DependencyGraph, 
    context: ExecutionContext
  ): Promise<void> {
    const maxLevel = Math.max(...Array.from(graph.levels.values()));
    
    for (let level = 0; level <= maxLevel; level++) {
      const stepsAtLevel = steps.filter(step => graph.levels.get(step.id) === level);
      
      if (stepsAtLevel.length === 0) continue;
      
      // Execute steps at the same level in parallel
      const results = await Promise.all(
        stepsAtLevel.map(step => this.executeStep(step, context))
      );
      
      // Update context with results
      results.forEach(result => {
        if (result.status === 'completed') {
          context.stepResults[result.stepId] = result.outputs;
        } else {
          throw new Error(`Step ${result.stepId} failed: ${result.error}`);
        }
      });
    }
  }

  private async loadWorkflow(workflowId: string): Promise<Workflow> {
    // For now, load from static definitions
    // In the future, this could load from database or file system
    try {
      const workflows = await import('./workflows');
      const workflow = workflows.default[workflowId];
      
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      
      return workflow;
    } catch (error) {
      throw new Error(`Failed to load workflow ${workflowId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
