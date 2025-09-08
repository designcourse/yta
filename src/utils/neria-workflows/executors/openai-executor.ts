import { BaseExecutor } from './base-executor';
import { WorkflowStep, ExecutionContext, OpenAIConfig } from '../types';

export class OpenAIExecutor extends BaseExecutor {
  async execute(
    step: WorkflowStep, 
    inputs: Record<string, any>, 
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    this.logStep(step.id, `Executing OpenAI call: ${step.name}`);
    console.log(`[OpenAI] Step ${step.id} received inputs:`, JSON.stringify(inputs, null, 2));
    
    const config = step.config as OpenAIConfig;
    const { prompt: promptInput, ...otherInputs } = inputs;

    // Resolve prompt/system from system_prompts if keys are provided
    let systemText = config.system;
    let promptBase = promptInput as string | undefined;
    try {
      if (config.systemKey || config.promptKey) {
        const { getPrompt } = await import('@/utils/prompts');
        if (!systemText && config.systemKey) systemText = await getPrompt(config.systemKey);
        if (!promptBase && config.promptKey) promptBase = await getPrompt(config.promptKey);
      }
    } catch {}

    if (!promptBase) {
      throw new Error('Prompt is required for OpenAI calls');
    }

    // NEW: Process the system text with template variables as well
    if (systemText) {
      systemText = this.processPromptTemplate(systemText, otherInputs);
    }

    // Process the prompt with template variables
    const processedPrompt = this.processPromptTemplate(promptBase, otherInputs);
    console.log(`[OpenAI] Step ${step.id} processed prompt:`, processedPrompt);
    console.log(`[OpenAI] Step ${step.id} system text:`, systemText);

    // Use the existing OpenAI utility
    const { getClient } = await import('@/utils/openai');
    const client = getClient('openai');
    
    const response = await client.chat.completions.create({
      model: config.model || 'gpt-4o-mini',
      messages: [
        ...(systemText ? [{ role: 'system', content: systemText }] : []),
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
    let processed = String(prompt);

    // Replace {{variable}} patterns
    processed = processed.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (match, varPath) => {
      const value = this.getNestedValue(variables, String(varPath));
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

  private getNestedValue(obj: any, path: string): any {
    try {
      return path.split('.').reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj);
    } catch {
      return undefined;
    }
  }
}
