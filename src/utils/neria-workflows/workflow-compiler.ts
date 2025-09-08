import { WorkflowNodeData } from '@/components/WorkflowEditor/WorkflowNode';
import { Workflow, WorkflowStep } from './types';
import { getEndpointById } from './api-discovery';

export interface CompilerOptions {
  includeMetadata?: boolean;
  validateConnections?: boolean;
  generateComments?: boolean;
}

export class WorkflowCompiler {
  private options: CompilerOptions;
  private nodesById: Map<string, WorkflowNodeData> = new Map();

  constructor(options: CompilerOptions = {}) {
    this.options = {
      includeMetadata: true,
      validateConnections: true,
      generateComments: true,
      ...options
    };
  }

  /**
   * Compile visual workflow nodes into executable workflow definition
   */
  compile(
    nodes: WorkflowNodeData[], 
    workflowName: string, 
    description?: string
  ): Workflow {
    if (nodes.length === 0) {
      throw new Error('Cannot compile empty workflow');
    }

    // Cache nodes for lookup during input wiring
    this.nodesById = new Map(nodes.map(n => [n.id, n]));

    // Build dependency graph
    const dependencyMap = this.buildDependencyGraph(nodes);
    
    // Validate connections if enabled
    if (this.options.validateConnections) {
      this.validateWorkflow(nodes, dependencyMap);
    }

    // Sort nodes by dependency order
    const sortedNodes = this.topologicalSort(nodes, dependencyMap);

    // Generate workflow steps
    const steps = sortedNodes.map(node => this.compileNode(node, dependencyMap));

    const workflow: Workflow = {
      id: this.generateWorkflowId(workflowName),
      name: workflowName,
      version: '1.0.0',
      description: description || `Visual workflow with ${nodes.length} steps`,
      triggers: [
        {
          type: 'manual',
          config: {}
        }
      ],
      steps
    };

    return workflow;
  }

  /**
   * Build dependency graph from node connections
   */
  private buildDependencyGraph(nodes: WorkflowNodeData[]): Map<string, string[]> {
    const dependencyMap = new Map<string, string[]>();
    
    // Initialize all nodes
    nodes.forEach(node => {
      dependencyMap.set(node.id, []);
    });

    // Build dependencies from connections
    nodes.forEach(node => {
      node.connections.forEach(targetId => {
        const targetDeps = dependencyMap.get(targetId) || [];
        targetDeps.push(node.id);
        dependencyMap.set(targetId, targetDeps);
      });
    });

    return dependencyMap;
  }

  /**
   * Validate workflow structure
   */
  private validateWorkflow(nodes: WorkflowNodeData[], dependencyMap: Map<string, string[]>): void {
    // Check for circular dependencies
    this.detectCircularDependencies(nodes, dependencyMap);

    // Check for orphaned nodes (nodes with no inputs or outputs)
    const orphanedNodes = nodes.filter(node => {
      const hasInputs = dependencyMap.get(node.id)?.length || 0 > 0;
      const hasOutputs = node.connections.length > 0;
      return !hasInputs && !hasOutputs && nodes.length > 1;
    });

    if (orphanedNodes.length > 0) {
      console.warn(`Found ${orphanedNodes.length} orphaned nodes:`, orphanedNodes.map(n => n.id));
    }

    // Validate node configurations
    nodes.forEach(node => {
      if (node.endpoint) {
        this.validateNodeConfiguration(node);
      }
    });
  }

  /**
   * Detect circular dependencies using DFS
   */
  private detectCircularDependencies(nodes: WorkflowNodeData[], dependencyMap: Map<string, string[]>): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = dependencyMap.get(nodeId) || [];
      for (const depId of dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          throw new Error(`Circular dependency detected involving nodes: ${nodeId} -> ${depId}`);
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    });
  }

  /**
   * Validate individual node configuration
   */
  private validateNodeConfiguration(node: WorkflowNodeData): void {
    if (!node.endpoint) return;

    const endpoint = getEndpointById(node.endpoint.id);
    if (!endpoint) {
      throw new Error(`Unknown endpoint: ${node.endpoint.id}`);
    }

    // Check required inputs
    const requiredInputs = endpoint.inputs.filter(input => input.required);
    const missingInputs = requiredInputs.filter(input => 
      !node.inputs.hasOwnProperty(input.name) || 
      node.inputs[input.name] === undefined ||
      node.inputs[input.name] === ''
    );

    if (missingInputs.length > 0) {
      console.warn(`Node ${node.id} missing required inputs:`, missingInputs.map(i => i.name));
    }
  }

  /**
   * Topologically sort nodes based on dependencies
   */
  private topologicalSort(nodes: WorkflowNodeData[], dependencyMap: Map<string, string[]>): WorkflowNodeData[] {
    const sorted: WorkflowNodeData[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (nodeId: string): void => {
      if (temp.has(nodeId)) {
        throw new Error(`Circular dependency detected at node: ${nodeId}`);
      }
      if (visited.has(nodeId)) return;

      temp.add(nodeId);
      
      const dependencies = dependencyMap.get(nodeId) || [];
      dependencies.forEach(depId => visit(depId));
      
      temp.delete(nodeId);
      visited.add(nodeId);
      
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        sorted.push(node);
      }
    };

    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        visit(node.id);
      }
    });

    return sorted;
  }

  /**
   * Compile individual node to workflow step
   */
  private compileNode(node: WorkflowNodeData, dependencyMap: Map<string, string[]>): WorkflowStep {
    const dependencies = dependencyMap.get(node.id) || [];
    
    // Determine step type based on node
    let stepType: WorkflowStep['type'] = 'transform';
    let config: Record<string, any> = {};
    const resolvedEndpoint = node.endpoint ? getEndpointById(node.endpoint.id) : undefined;

    if (resolvedEndpoint) {
      switch (resolvedEndpoint.category) {
        case 'youtube':
          stepType = 'youtube-api';
          config = {
            endpoint: this.mapYouTubeEndpoint(resolvedEndpoint.id),
            params: node.config
          };
          break;
        
        case 'openai':
          stepType = 'openai';
          config = {
            model: node.config.model || 'gpt-4o-mini',
            system: node.config.system,
            // Pass through optional bindings to system_prompts so the executor
            // can resolve DB-stored templates when prompt is blank
            systemKey: node.config.systemKey,
            promptKey: node.config.promptKey,
            maxTokens: node.config.maxTokens || 150,
            temperature: node.config.temperature || 0.7
          };
          break;

        case 'database':
          stepType = 'transform'; // Database operations as transforms for now
          config = {
            script: this.generateDatabaseScript(node.endpoint.id, node.config)
          };
          break;

        case 'external':
          if (node.endpoint.id === 'transform-data') {
            stepType = 'transform';
            config = {
              script: node.config.script || 'return data;'
            };
          } else {
            stepType = 'transform';
            config = {
              script: this.generateHttpScript(node.endpoint.id, node.config)
            };
          }
          break;
      }
    }

    // Generate inputs with variable references
    const inputs = this.generateStepInputs(node, dependencies);
    
    // Generate outputs
    const outputs = resolvedEndpoint?.outputs.map(output => output.name) || ['result'];

    const step: WorkflowStep = {
      id: node.id,
      type: stepType,
      name: resolvedEndpoint?.name || `Step ${node.id.slice(-4)}`,
      config,
      inputs,
      outputs,
      dependencies
    };

    return step;
  }

  /**
   * Map visual endpoint IDs to workflow endpoint names
   */
  private mapYouTubeEndpoint(endpointId: string): string {
    const mapping: Record<string, string> = {
      'youtube-channels': 'channels',
      'youtube-analytics': 'analytics-reports',
      'youtube-videos': 'videos',
      'youtube-search': 'search',
      'youtube-playlists': 'playlists',
      'youtube-playlist-items': 'playlist-items',
      'youtube-subscriptions': 'subscriptions',
      'youtube-comments': 'comments',
      'youtube-comment-threads': 'comment-threads',
      'youtube-captions': 'captions',
      'youtube-analytics-groups': 'analytics-groups',
      'youtube-analytics-group-items': 'analytics-group-items'
    };
    return mapping[endpointId] || endpointId;
  }

  /**
   * Generate database operation script
   */
  private generateDatabaseScript(endpointId: string, config: Record<string, any>): string {
    switch (endpointId) {
      case 'db-save-data':
        return `
          // Save data to database
          const { supabase } = await import('@/utils/supabase/server');
          const client = supabase();
          const { data, error } = await client
            .from('${config.table || 'data'}')
            .insert(data);
          if (error) throw error;
          return { saved: data };
        `;
      
      case 'db-query-data':
        return `
          // Query data from database
          const { supabase } = await import('@/utils/supabase/server');
          const client = supabase();
          let query = client.from('${config.table || 'data'}').select('*');
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              query = query.eq(key, value);
            });
          }
          if (limit) query = query.limit(limit);
          const { data, error } = await query;
          if (error) throw error;
          return { results: data };
        `;
      
      default:
        return 'return data;';
    }
  }

  /**
   * Generate HTTP request script
   */
  private generateHttpScript(endpointId: string, config: Record<string, any>): string {
    if (endpointId === 'http-request') {
      return `
        // Make HTTP request
        const response = await fetch(url, {
          method: method || 'GET',
          headers: headers || {},
          body: body ? JSON.stringify(body) : undefined
        });
        const data = await response.json();
        return { response: data };
      `;
    }
    return 'return data;';
  }

  /**
   * Generate step inputs with proper variable references
   */
  private generateStepInputs(node: WorkflowNodeData, dependencies: string[]): Record<string, any> {
    const inputs: Record<string, any> = {};

    // Add configured inputs
    Object.entries(node.inputs).forEach(([key, value]) => {
      inputs[key] = value;
    });

    // Add dependency references with basic heuristics
    const endpointInputs = node.endpoint ? (getEndpointById(node.endpoint.id)?.inputs ?? []) : [];
    const preferredInputOrder = ['content', 'data', 'videoIds', 'rows', 'input', 'payload'];
    const pickInputKey = (): string | undefined => {
      for (const name of preferredInputOrder) {
        if (endpointInputs.some(i => i.name === name)) return name;
      }
      return endpointInputs[0]?.name; // fallback to first input if any
    };

    dependencies.forEach((depId, index) => {
      const depNode = this.nodesById.get(depId);
      const depOutputs = depNode?.endpoint?.outputs?.map(o => o.name) ?? ['result'];
      const chosenOutput = depOutputs[0] ?? 'result';

      const key = pickInputKey() ?? 'data';
      // Only set if not already provided by user
      if (inputs[key] === undefined) {
        inputs[key] = `$steps.${depId}.${chosenOutput}`;
      } else {
        // If first key already taken and there are more inputs, try to append to another input
        const alternate = endpointInputs.find(i => inputs[i.name] === undefined)?.name;
        if (alternate) {
          inputs[alternate] = `$steps.${depId}.${chosenOutput}`;
        }
      }
    });

    // Add default inputs based on endpoint
    if (node.endpoint) {
      const resolvedEndpoint = getEndpointById(node.endpoint.id);
      resolvedEndpoint?.inputs.forEach(input => {
        if (!inputs.hasOwnProperty(input.name)) {
          if (input.name === 'accessToken') {
            inputs[input.name] = '$input.accessToken';
          } else if (input.name === 'channelId') {
            inputs[input.name] = '$input.channelId';
          } else if (input.default !== undefined) {
            inputs[input.name] = input.default;
          }
        }
      });
    }

    return inputs;
  }

  /**
   * Generate workflow ID from name
   */
  private generateWorkflowId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Generate workflow file content
   */
  generateWorkflowFile(workflow: Workflow): string {
    const imports = `import { Workflow } from '../types';`;
    
    const workflowCode = `
const ${workflow.id.replace(/-/g, '')}Workflow: Workflow = ${JSON.stringify(workflow, null, 2)};

export default ${workflow.id.replace(/-/g, '')}Workflow;
    `.trim();

    return `${imports}\n\n${workflowCode}`;
  }
}
