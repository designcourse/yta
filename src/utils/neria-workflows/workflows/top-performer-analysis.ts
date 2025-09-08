import { Workflow } from '../types';

const topPerformerAnalysis: Workflow = {
  id: 'top-performer-analysis',
  name: 'Top Performer Analysis',
  version: '1.0.0',
  description: 'Analyze top performing videos and identify winning themes',
  triggers: [
    {
      type: 'manual',
      config: {}
    }
  ],
  steps: [
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
      dependencies: []
    },
    {
      id: 'identify-winners',
      type: 'transform',
      name: 'Identify Top Performers',
      config: {
        script: `
          const processed = analyticsRows.map(row => ({
            video: row[0],
            views: row[1],
            estimatedMinutesWatched: row[2],
            averageViewDuration: row[3],
            averageViewPercentage: row[4],
            subscribersGained: row[5],
            viewsPerDay: row[1] / 90
          }));
          processed.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
          return {
            topIds: processed.slice(0, 10).map(p => p.video),
            topMetrics: processed.slice(0, 10)
          };
        `
      },
      inputs: {
        analyticsRows: '$steps.fetch-analytics.analyticsRows'
      },
      outputs: ['topIds', 'topMetrics'],
      dependencies: ['fetch-analytics']
    },
    {
      id: 'fetch-video-details',
      type: 'youtube-api',
      name: 'Fetch Top Video Details',
      config: {
        endpoint: 'videos',
        params: {
          part: 'snippet,contentDetails,statistics'
        }
      },
      inputs: {
        accessToken: '$input.accessToken',
        videoIds: '$steps.identify-winners.topIds'
      },
      outputs: ['videoDetails'],
      dependencies: ['identify-winners']
    },
    {
      id: 'extract-titles',
      type: 'transform',
      name: 'Extract Video Titles',
      config: {
        script: `
          return {
            titlesList: videoDetails.map(video => video.title).join(', ')
          };
        `
      },
      inputs: {
        videoDetails: '$steps.fetch-video-details.videoDetails'
      },
      outputs: ['titlesList'],
      dependencies: ['fetch-video-details']
    },
    {
      id: 'analyze-themes',
      type: 'openai',
      name: 'Analyze Winning Themes',
      config: {
        model: 'gpt-4o-mini',
        systemKey: 'collection_winners_theme',
        maxTokens: 150
      },
      inputs: {
        prompt: 'Analyze the top-performing video titles and channel context.',
        winners_titles: '$steps.extract-titles.titlesList',
        channel_title: '$input.channelTitle'
      },
      outputs: ['themeAnalysis'],
      dependencies: ['extract-titles']
    },
    {
      id: 'format-winners',
      type: 'transform',
      name: 'Format Winner Data',
      config: {
        script: `
          const winners = videoDetails.map((video, index) => {
            const metrics = topMetrics.find(m => m.video === video.id);
            return {
              id: video.id,
              title: video.title,
              thumb: video.thumbnails?.high?.url || video.thumbnails?.medium?.url || video.thumbnails?.default?.url || '',
              publishedAt: video.publishedAt,
              duration: video.duration,
              metrics: {
                views: metrics?.views || video.viewCount,
                watchTime: (metrics?.estimatedMinutesWatched || 0) * 60,
                avgViewDur: metrics?.averageViewDuration || 0,
                avgViewPct: metrics?.averageViewPercentage || 0,
                impressions: 0,
                ctr: 0,
                subsGained: metrics?.subscribersGained || 0,
                viewsPerDay: metrics?.viewsPerDay || 0
              }
            };
          }).sort((a, b) => b.metrics.viewsPerDay - a.metrics.viewsPerDay);

          return {
            winners,
            topPerformer: winners[0],
            themeAnalysis,
            analytics90d: {
              baseline: {
                ctrMedian: 0,
                avgPctMedian: 50
              }
            }
          };
        `
      },
      inputs: {
        videoDetails: '$steps.fetch-video-details.videoDetails',
        topMetrics: '$steps.identify-winners.topMetrics',
        themeAnalysis: '$steps.analyze-themes.themeAnalysis'
      },
      outputs: ['result'],
      dependencies: ['fetch-video-details', 'identify-winners', 'analyze-themes']
    }
  ]
};

export default topPerformerAnalysis;
