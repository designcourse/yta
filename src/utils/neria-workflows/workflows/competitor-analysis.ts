import { Workflow } from '../types';

const competitorAnalysis: Workflow = {
  id: 'competitor-analysis',
  name: 'Competitor Analysis',
  version: '1.0.0',
  description: 'Analyze competitor channels and compare with your performance',
  triggers: [
    {
      type: 'manual',
      config: {}
    }
  ],
  steps: [
    {
      id: 'search-competitors',
      type: 'youtube-api',
      name: 'Search Competitor Channels',
      config: {
        endpoint: 'search',
        params: {
          type: 'channel',
          maxResults: 10,
          order: 'relevance'
        }
      },
      inputs: {
        accessToken: '$input.accessToken',
        searchQuery: '$input.searchQuery'
      },
      outputs: ['competitorChannels'],
      dependencies: []
    },
    {
      id: 'fetch-competitor-videos',
      type: 'youtube-api',
      name: 'Get Competitor Top Videos',
      config: {
        endpoint: 'search',
        params: {
          type: 'video',
          maxResults: 20,
          order: 'viewCount'
        }
      },
      inputs: {
        accessToken: '$input.accessToken',
        channelIds: '$steps.search-competitors.competitorChannels.*.id'
      },
      outputs: ['competitorVideos'],
      dependencies: ['search-competitors']
    },
    {
      id: 'analyze-competitor-strategies',
      type: 'openai',
      name: 'Analyze Competitor Strategies',
      config: {
        model: 'gpt-4o-mini',
        system: 'You are a YouTube strategy analyst. Analyze competitor video titles and identify successful patterns.',
        maxTokens: 200
      },
      inputs: {
        prompt: 'Analyze these competitor video titles and identify successful patterns: {{videoTitles}}',
        videoTitles: '$steps.fetch-competitor-videos.competitorVideos.*.title'
      },
      outputs: ['strategyAnalysis'],
      dependencies: ['fetch-competitor-videos']
    },
    {
      id: 'compare-performance',
      type: 'transform',
      name: 'Compare Performance Metrics',
      config: {
        script: `
          const myChannelId = workflowInputs.channelId;
          const competitors = competitorChannels || [];
          const myStats = workflowInputs.myChannelStats || {};
          
          const comparison = competitors.map(comp => ({
            channelId: comp.id,
            name: comp.title,
            subscribers: comp.subscriberCount || 0,
            avgViews: comp.avgViews || 0,
            vsMe: {
              subscriberRatio: (comp.subscriberCount || 0) / Math.max(myStats.subscribers || 1, 1),
              viewRatio: (comp.avgViews || 0) / Math.max(myStats.avgViews || 1, 1)
            }
          }));
          
          return {
            myChannel: myStats,
            competitors: comparison,
            insights: {
              biggerChannels: comparison.filter(c => c.vsMe.subscriberRatio > 1).length,
              betterPerforming: comparison.filter(c => c.vsMe.viewRatio > 1).length,
              totalAnalyzed: comparison.length
            }
          };
        `
      },
      inputs: {
        competitorChannels: '$steps.search-competitors.competitorChannels',
        myChannelStats: '$input.myChannelStats'
      },
      outputs: ['performanceComparison'],
      dependencies: ['search-competitors']
    },
    {
      id: 'generate-recommendations',
      type: 'openai',
      name: 'Generate Strategy Recommendations',
      config: {
        model: 'gpt-4o-mini',
        system: 'You are a YouTube growth strategist. Provide actionable recommendations based on competitor analysis.',
        maxTokens: 150
      },
      inputs: {
        prompt: 'Based on this competitor analysis: {{strategyAnalysis}} and performance comparison: {{performanceData}}, provide 3 actionable recommendations for improvement.',
        strategyAnalysis: '$steps.analyze-competitor-strategies.strategyAnalysis',
        performanceData: '$steps.compare-performance.performanceComparison'
      },
      outputs: ['recommendations'],
      dependencies: ['analyze-competitor-strategies', 'compare-performance']
    }
  ]
};

export default competitorAnalysis;
