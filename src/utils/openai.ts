import OpenAI from 'openai';
import { createSupabaseServerClient } from '@/utils/supabase/server';

// Initialize clients dynamically to ensure env vars are loaded
let openaiClient: OpenAI | null = null;
let perplexityClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    openaiClient = new OpenAI({
      apiKey,
    });
  }
  return openaiClient;
}

function getPerplexityClient() {
  if (!perplexityClient) {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error('Missing PERPLEXITY_API_KEY environment variable');
    }
    perplexityClient = new OpenAI({
      apiKey,
      baseURL: 'https://api.perplexity.ai',
    });
  }
  return perplexityClient;
}

function getClient(provider: string) {
  switch (provider) {
    case 'openai':
      return getOpenAIClient();
    case 'perplexity':
      return getPerplexityClient();
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function interpretYouTubeData(data: any, prompt?: string, provider: string = 'perplexity', model: string = 'llama-3.1-sonar-large-128k-online') {
  const defaultPrompt = `Analyze this YouTube data and provide insights about the channel's performance, content strategy, and audience engagement. Focus on key metrics, trends, and actionable recommendations. You have access to real-time information, so include recent trends and current market context where relevant.`;

  try {
    // Validate inputs
    if (!prompt && !defaultPrompt) {
      throw new Error('No prompt provided for LLM analysis');
    }

    const finalPrompt = prompt || defaultPrompt;
    console.log(`🔍 ${provider.toUpperCase()} - Final prompt length:`, finalPrompt.length);
    console.log(`🔍 ${provider.toUpperCase()} - Data size:`, JSON.stringify(data).length);

    // Validate prompt is not too long
    if (finalPrompt.length > 32000) {
      console.warn(`⚠️ ${provider.toUpperCase()} - Prompt is very long, truncating...`);
    }

    const client = getClient(provider);

    // Create the API call with timeout
    const apiCall = client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: finalPrompt
        },
        {
          role: 'user',
          content: `Please analyze this YouTube data:\n\n${JSON.stringify(data, null, 2)}`
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    });

    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${provider} API call timed out after 45 seconds`)), 45000);
    });

    console.log(`🔍 ${provider.toUpperCase()} - Starting API call...`);
    const completion = await Promise.race([apiCall, timeoutPromise]) as any;

    console.log(`🔍 ${provider.toUpperCase()} - API call completed successfully`);
    const response = completion.choices[0]?.message?.content || 'No analysis generated';

    if (!response || response.length === 0) {
      console.warn(`⚠️ ${provider.toUpperCase()} - Empty response received from API`);
      return 'I apologize, but I was unable to generate a response at this time.';
    }

    console.log(`🔍 ${provider.toUpperCase()} - Response length:`, response.length);
    return response;

  } catch (error) {
    console.error(`❌ ${provider.toUpperCase()} - Error calling API:`, error);

    // Log detailed error information
    if (error instanceof Error) {
      console.error(`❌ ${provider.toUpperCase()} - Error message:`, error.message);
      console.error(`❌ ${provider.toUpperCase()} - Error name:`, error.name);
      if (error.stack) {
        console.error(`❌ ${provider.toUpperCase()} - Error stack:`, error.stack);
      }
    } else {
      console.error(`❌ ${provider.toUpperCase()} - Unknown error type:`, typeof error, error);
    }

    // Re-throw with more context
    throw new Error(`Failed to analyze YouTube data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function for more specific analysis
export async function analyzeChannelMetrics(metrics: any) {
  const prompt = `Analyze these YouTube channel metrics and provide specific insights about:
  - Performance trends
  - Audience growth patterns
  - Content performance analysis
  - Recommendations for improvement
  - Current market trends and opportunities

  Format the response as a structured analysis with clear sections.`;

  return interpretYouTubeData(metrics, prompt);
}

// Helper function for content strategy analysis
export async function analyzeContentStrategy(videos: any[]) {
  const prompt = `Analyze this YouTube video content and provide insights about:
  - Content strategy effectiveness
  - Video performance patterns
  - Optimal posting times/frequency
  - Content gap analysis
  - SEO and discoverability recommendations
  - Recent trending topics and content opportunities

  Focus on actionable insights that can improve content performance.`;

  return interpretYouTubeData(videos, prompt);
}

// Get current model configuration from database
export async function getCurrentModel() {
  const supabase = createSupabaseServerClient();
  
  const { data: settings } = await supabase
    .from("model_settings")
    .select("current_model_id")
    .single();

  if (!settings?.current_model_id) {
    // Fallback to default OpenAI GPT-4o for primary chat
    return {
      provider: "openai",
      model: "gpt-4o",
      max_input_tokens: 128000,
      max_output_tokens: 8192,
    };
  }

  const { data: modelProvider } = await supabase
    .from("model_providers")
    .select("provider, model, max_input_tokens, max_output_tokens")
    .eq("id", settings.current_model_id)
    .single();

  return modelProvider || {
    provider: "openai",
    model: "gpt-4o",
    max_input_tokens: 128000,
    max_output_tokens: 8192,
  };
}

// Export getClient for use in other modules
export { getClient };
