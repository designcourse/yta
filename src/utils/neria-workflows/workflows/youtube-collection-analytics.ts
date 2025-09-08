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
              prompt: 'Hey there, amazing community of {{channelData.title}}! With {{channelData.subscriberCount}} subscribers, you\'ve built an incredible family here.',
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
              system: 'You are Neria, a concise YouTube coach. Analyze video title patterns and identify successful themes.',
              maxTokens: 120
            },
            inputs: {
              prompt: 'Analyze winning themes from these top performing video titles: {{titles}}. Identify the common patterns that make them successful.',
              titles: '$steps.build-initial.videoTitles'
            },
            outputs: ['slide2Text'],
            dependencies: ['build-initial']
          }
        ]
      },
      inputs: {},
      outputs: ['slide1Text', 'slide2Text'],
      dependencies: ['fetch-channel', 'fetch-video-details']
    },
    {
      id: 'build-initial',
      type: 'transform',
      name: 'Build Initial Data',
      config: {
        script: `
          // Calculate analytics baseline
          const analytics90d = {
            baseline: {
              ctrMedian: 0,
              avgPctMedian: 50
            }
          };

          // Extract video titles for theme analysis
          const videoTitles = videoDetails.map(v => v.title).join(', ');

          // Process winners with analytics data
          const winners = videoDetails.map((video, index) => {
            const analyticsRow = analyticsRows.find(row => row[0] === video.id);
            const views = analyticsRow ? analyticsRow[1] : video.viewCount;
            const estimatedMinutesWatched = analyticsRow ? analyticsRow[2] : 0;
            const averageViewDuration = analyticsRow ? analyticsRow[3] : 0;
            const averageViewPercentage = analyticsRow ? analyticsRow[4] : 0;
            const subscribersGained = analyticsRow ? analyticsRow[5] : 0;
            
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
              averageViewPercentage: averageViewPercentage,
              subscribersGained: subscribersGained,
              viewsPerDay: views / 90
            };
          });

          // Map channel data to expected format
          const channel = {
            id: channelData.id,
            title: channelData.title,
            description: channelData.description,
            subs: channelData.subscriberCount,
            views: channelData.viewCount,
            videoCount: channelData.videoCount,
            publishedAt: channelData.publishedAt
          };

          // Map winners to expected format with metrics object
          const formattedWinners = winners.map(winner => ({
            id: winner.id,
            title: winner.title,
            thumb: winner.thumbnails?.high?.url || winner.thumbnails?.medium?.url || winner.thumbnails?.default?.url || '',
            publishedAt: winner.publishedAt,
            duration: winner.duration,
            metrics: {
              views: winner.views,
              watchTime: winner.estimatedMinutesWatched * 60, // convert to seconds
              avgViewDur: winner.averageViewDuration,
              avgViewPct: winner.averageViewPercentage || 0,
              impressions: 0, // not available in this data
              ctr: 0, // not available in this data  
              subsGained: winner.subscribersGained || 0,
              viewsPerDay: winner.viewsPerDay
            }
          })).sort((a, b) => b.metrics.viewsPerDay - a.metrics.viewsPerDay);

          return {
            channel,
            analytics90d,
            winners: formattedWinners,
            loserIds: bottomIds,
            videoTitles,
            slide1Text
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
      outputs: ['channel', 'analytics90d', 'winners', 'loserIds', 'videoTitles', 'slide1Text'],
      dependencies: ['fetch-channel', 'fetch-video-details', 'fetch-analytics', 'process-winners', 'generate-insights']
    },
    {
      id: 'build-final',
      type: 'transform',
      name: 'Build Final Response',
      config: {
        script: `
          return {
            channel,
            analytics90d,
            winners,
            loserIds,
            slide1Text,
            slide2Text: slide2Text || "",
            slide3Text: ""
          };
        `
      },
      inputs: {
        channel: '$steps.build-initial.channel',
        analytics90d: '$steps.build-initial.analytics90d',
        winners: '$steps.build-initial.winners',
        loserIds: '$steps.build-initial.loserIds',
        slide1Text: '$steps.build-initial.slide1Text',
        slide2Text: '$steps.generate-insights.slide2Text'
      },
      outputs: ['finalResponse'],
      dependencies: ['build-initial', 'generate-insights']
    }
  ]
};

export default youtubeCollectionAnalytics;
