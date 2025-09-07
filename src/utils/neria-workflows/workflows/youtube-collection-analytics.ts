import { Workflow } from '../types';

const youtubeCollectionAnalytics: Workflow = {
  id: 'youtube-collection-analytics',
  name: 'YouTube Collection Analytics',
  version: '1.0.0',
  description: 'Complete YouTube channel analysis for collection page',
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
          part: 'snippet,statistics',
          mine: true
        }
      },
      inputs: {
        accessToken: '$input.accessToken'
      },
      outputs: ['channelData'],
      dependencies: []
    },
    {
      id: 'fetch-analytics',
      type: 'youtube-api',
      name: 'Fetch Analytics Data',
      config: {
        endpoint: 'analytics-reports',
        params: {
          dimensions: 'video',
          metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained',
          maxResults: 200,
          sort: '-views',
          days: 90
        }
      },
      inputs: {
        accessToken: '$input.accessToken',
        channelId: '$input.channelId'
      },
      outputs: ['analyticsRows', 'columnHeaders'],
      dependencies: ['fetch-channel']
    },
    {
      id: 'process-winners',
      type: 'transform',
      name: 'Process Top Performers',
      config: {
        script: `
          const processed = analyticsRows.map(row => ({
            video: row[0],
            views: row[1],
            viewsPerDay: row[1] / 90
          }));
          processed.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
          return {
            topIds: processed.slice(0, 10).map(p => p.video),
            bottomIds: processed.slice(-10).map(p => p.video)
          };
        `
      },
      inputs: {
        analyticsRows: '$steps.fetch-analytics.analyticsRows'
      },
      outputs: ['topIds', 'bottomIds'],
      dependencies: ['fetch-analytics']
    },
    {
      id: 'fetch-video-details',
      type: 'youtube-api',
      name: 'Fetch Video Details',
      config: {
        endpoint: 'videos',
        params: {
          part: 'snippet,contentDetails,statistics'
        }
      },
      inputs: {
        accessToken: '$input.accessToken',
        videoIds: '$steps.process-winners.topIds'
      },
      outputs: ['videoDetails'],
      dependencies: ['process-winners']
    },
    {
      id: 'generate-insights',
      type: 'parallel',
      name: 'Generate AI Insights',
      config: {
        steps: [
          {
            id: 'greeting',
            type: 'openai',
            name: 'Generate Greeting',
            config: {
              model: 'gpt-4o-mini',
              system: 'You are Neria, a warm, concise YouTube coach.',
              maxTokens: 120
            },
            inputs: {
              prompt: 'Generate greeting for {{channelData.title}} with {{channelData.subscriberCount}} subscribers',
              channelData: '$steps.fetch-channel.channelData'
            },
            outputs: ['slide1Text'],
            dependencies: []
          },
          {
            id: 'theme-analysis',
            type: 'openai',
            name: 'Analyze Themes',
            config: {
              model: 'gpt-4o-mini',
              system: 'You are Neria, a concise YouTube coach.',
              maxTokens: 80
            },
            inputs: {
              prompt: 'Analyze winning themes from: {{videoTitles}}',
              videoTitles: '$steps.fetch-video-details.videoDetails.*.title'
            },
            outputs: ['slide2Text'],
            dependencies: []
          }
        ]
      },
      inputs: {},
      outputs: ['slide1Text', 'slide2Text'],
      dependencies: ['fetch-channel', 'fetch-video-details']
    },
    {
      id: 'build-response',
      type: 'transform',
      name: 'Build Final Response',
      config: {
        script: `
          // Calculate analytics baseline
          const analytics90d = {
            baseline: {
              ctrMedian: 0,
              avgPctMedian: 50
            }
          };

          // Process winners with analytics data
          const winners = videoDetails.map((video, index) => {
            const analyticsRow = analyticsRows.find(row => row[0] === video.id);
            const views = analyticsRow ? analyticsRow[1] : video.viewCount;
            const estimatedMinutesWatched = analyticsRow ? analyticsRow[2] : 0;
            const averageViewDuration = analyticsRow ? analyticsRow[3] : 0;
            
            return {
              id: video.id,
              title: video.title,
              description: video.description,
              thumbnails: video.thumbnails,
              publishedAt: video.publishedAt,
              duration: video.duration,
              viewCount: video.viewCount,
              likeCount: video.likeCount,
              commentCount: video.commentCount,
              views: views,
              estimatedMinutesWatched: estimatedMinutesWatched,
              averageViewDuration: averageViewDuration,
              viewsPerDay: views / 90
            };
          });

          return {
            channel: channelData,
            analytics90d,
            winners: winners.sort((a, b) => b.viewsPerDay - a.viewsPerDay),
            loserIds: bottomIds,
            slide1Text,
            slide2Text,
            slide3Text: ""
          };
        `
      },
      inputs: {
        channelData: '$steps.fetch-channel.channelData',
        videoDetails: '$steps.fetch-video-details.videoDetails',
        analyticsRows: '$steps.fetch-analytics.analyticsRows',
        bottomIds: '$steps.process-winners.bottomIds',
        slide1Text: '$steps.generate-insights.slide1Text',
        slide2Text: '$steps.generate-insights.slide2Text'
      },
      outputs: ['finalResponse'],
      dependencies: ['fetch-channel', 'fetch-video-details', 'fetch-analytics', 'process-winners', 'generate-insights']
    }
  ]
};

export default youtubeCollectionAnalytics;
