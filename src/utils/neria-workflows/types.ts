export interface WorkflowStep {
  id: string;
  type: 'youtube-api' | 'openai' | 'transform' | 'parallel' | 'condition';
  name: string;
  inputs: Record<string, any>;
  outputs: string[];
  config: Record<string, any>;
  dependencies: string[];
}

export interface WorkflowTrigger {
  type: 'manual' | 'scheduled' | 'webhook';
  config: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
}

export interface WorkflowError {
  stepId: string;
  message: string;
  timestamp: Date;
  stack?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  stepResults: Record<string, any>;
  errors: WorkflowError[];
}

export interface StepResult {
  stepId: string;
  status: 'completed' | 'failed';
  outputs: Record<string, any>;
  error?: string;
  executionTime: number;
}

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  stepResults: Record<string, any>;
  inputs: Record<string, any>;
}

export interface DependencyGraph {
  nodes: string[];
  edges: Map<string, string[]>;
  levels: Map<string, number>;
}

// YouTube API specific types
export interface YouTubeApiConfig {
  endpoint: 
    | 'channels'
    | 'videos'
    | 'playlists'
    | 'playlist-items'
    | 'subscriptions'
    | 'comments'
    | 'comment-threads'
    | 'captions'
    | 'search'
    | 'analytics-reports'
    | 'analytics-groups'
    | 'analytics-group-items';
  params: Record<string, any>;
}

// OpenAI specific types
export interface OpenAIConfig {
  model: string;
  system?: string;
  systemKey?: string;
  promptKey?: string;
  maxTokens?: number;
  temperature?: number;
}

// Transform specific types
export interface TransformConfig {
  script: string;
}

// Parallel execution specific types
export interface ParallelStep extends Omit<WorkflowStep, 'type'> {
  type: Exclude<WorkflowStep['type'], 'parallel'>;
}

export interface ParallelConfig {
  steps: ParallelStep[];
}
