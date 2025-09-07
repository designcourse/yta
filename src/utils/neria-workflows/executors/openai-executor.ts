import { BaseExecutor } from './base-executor';
import { WorkflowStep, ExecutionContext, OpenAIConfig } from '../types';

export class OpenAIExecutor extends BaseExecutor {
  async execute(
    step: WorkflowStep, 
    inputs: Record<string, any>, 
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    this.logStep(step.id, `Executing OpenAI call: ${step.name}`);
    
    const config = step.config as OpenAIConfig;
    const { prompt, ...otherInputs } = inputs;

    if (!prompt) {
      throw new Error('Prompt is required for OpenAI calls');
    }

    // Process the prompt with template variables
    const processedPrompt = this.processPromptTemplate(prompt, otherInputs);

    // Use the existing OpenAI utility
    const { getClient } = await import('@/utils/openai');
    const client = getClient('openai');
    
    const response = await client.chat.completions.create({
      model: config.model || 'gpt-4o-mini',
      messages: [
        ...(config.system ? [{ role: 'system', content: config.system }] : []),
        { role: 'user', content: processedPrompt }
      ],
      max_tokens: config.maxTokens || 150,
      temperature: config.temperature || 0.7,
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from OpenAI');
    }

    // Return the content with the first output key from the step definition
    const outputKey = step.outputs[0] || 'result';
    return {
      [outputKey]: content.trim()
    };
  }

  private processPromptTemplate(prompt: string, variables: Record<string, any>): string {
    let processed = prompt;

    // Replace {{variable}} patterns
    processed = processed.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const value = variables[varName];
      if (value === undefined || value === null) {
        return match; // Keep original if variable not found
      }
      
      // Handle arrays by joining them
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      
      // Handle objects by JSON stringifying them
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      
      return String(value);
    });

    return processed;
  }
}
