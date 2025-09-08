import { Workflow } from '../types';

const channelOverview: Workflow = {
  id: 'channel-overview',
  name: 'Channel Overview Analysis',
  version: '1.0.0',
  description: 'Fetch and analyze basic channel information with AI greeting',
  triggers: [
    {
      type: 'manual',
      config: {}
    }
  ],
  steps: [
    {
      id: 'fetch-channel',
      type: 'youtube-api',
      name: 'Fetch Channel Data',
      config: {
        endpoint: 'channels',
        params: {
          part: 'snippet,statistics'
        }
      },
      inputs: {
        accessToken: '$input.accessToken',
        channelId: '$input.channelId'
      },
      outputs: ['channelData'],
      dependencies: []
    },
    {
      id: 'generate-greeting',
      type: 'openai',
      name: 'Generate Channel Greeting',
      config: {
        model: 'gpt-4o-mini',
        system: 'You are Neria, a warm, supportive YouTube coach. Generate a personalized greeting that acknowledges the creator\'s community size and encourages them.',
        maxTokens: 120
      },
      inputs: {
        prompt: 'Create a warm greeting for {{title}} who has {{subscriberCount}} subscribers. Acknowledge their community and express confidence in helping them grow.',
        title: '$steps.fetch-channel.channelData.title',
        subscriberCount: '$steps.fetch-channel.channelData.subscriberCount'
      },
      outputs: ['greeting'],
      dependencies: ['fetch-channel']
    },
    {
      id: 'format-output',
      type: 'transform',
      name: 'Format Channel Overview',
      config: {
        script: `
          return {
            channel: {
              id: channelData.id,
              title: channelData.title,
              description: channelData.description,
              subs: channelData.subscriberCount,
              views: channelData.viewCount,
              videoCount: channelData.videoCount,
              publishedAt: channelData.publishedAt
            },
            greeting: greeting
          };
        `
      },
      inputs: {
        channelData: '$steps.fetch-channel.channelData',
        greeting: '$steps.generate-greeting.greeting'
      },
      outputs: ['result'],
      dependencies: ['fetch-channel', 'generate-greeting']
    }
  ]
};

export default channelOverview;
