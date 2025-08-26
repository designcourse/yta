import OpenAI from 'openai';

// Initialize OpenAI client dynamically to ensure env vars are loaded
let openaiClient: OpenAI | null = null;

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

export async function interpretYouTubeData(data: any, prompt?: string) {
  const defaultPrompt = `Analyze this YouTube data and provide insights about the channel's performance, content strategy, and audience engagement. Focus on key metrics, trends, and actionable recommendations.`;

  try {
    // Validate inputs
    if (!prompt && !defaultPrompt) {
      throw new Error('No prompt provided for OpenAI analysis');
    }

    const finalPrompt = prompt || defaultPrompt;
    console.log('🔍 OpenAI - Final prompt length:', finalPrompt.length);
    console.log('🔍 OpenAI - Data size:', JSON.stringify(data).length);

    // Validate prompt is not too long (OpenAI has token limits)
    if (finalPrompt.length > 32000) {
      console.warn('⚠️ OpenAI - Prompt is very long, truncating...');
    }

    const openai = getOpenAIClient();

    // Create the API call with timeout
    const apiCall = openai.chat.completions.create({
      model: 'gpt-4o', // Using the best available model
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
      max_tokens: 2000, // Increased for more detailed analysis
      temperature: 0.7,
      presence_penalty: 0.1, // Encourage more diverse responses
      frequency_penalty: 0.1, // Reduce repetition
    });

    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API call timed out after 45 seconds')), 45000);
    });

    console.log('🔍 OpenAI - Starting API call...');
    const completion = await Promise.race([apiCall, timeoutPromise]) as any;

    console.log('🔍 OpenAI - API call completed successfully');
    const response = completion.choices[0]?.message?.content || 'No analysis generated';

    if (!response || response.length === 0) {
      console.warn('⚠️ OpenAI - Empty response received from API');
      return 'I apologize, but I was unable to generate a response at this time.';
    }

    console.log('🔍 OpenAI - Response length:', response.length);
    return response;

  } catch (error) {
    console.error('❌ OpenAI - Error calling OpenAI API:', error);

    // Log detailed error information
    if (error instanceof Error) {
      console.error('❌ OpenAI - Error message:', error.message);
      console.error('❌ OpenAI - Error name:', error.name);
      if (error.stack) {
        console.error('❌ OpenAI - Error stack:', error.stack);
      }
    } else {
      console.error('❌ OpenAI - Unknown error type:', typeof error, error);
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

  Focus on actionable insights that can improve content performance.`;

  return interpretYouTubeData(videos, prompt);
}
