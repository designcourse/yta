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
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Using the best available model
      messages: [
        {
          role: 'system',
          content: prompt || defaultPrompt
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

    return completion.choices[0]?.message?.content || 'No analysis generated';
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw new Error('Failed to analyze YouTube data');
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
