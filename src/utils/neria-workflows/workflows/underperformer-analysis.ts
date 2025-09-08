import { Workflow } from '../types';

const underperformerAnalysis: Workflow = {
  id: 'underperformer-analysis',
  name: 'Underperformer Analysis',
  version: '1.0.0',
  description: 'Analyze underperforming videos and identify improvement opportunities',
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
          metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
          maxResults: 200,
          sort: '-views', // descending, we'll sort ascending in transform
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
      id: 'identify-underperformers',
      type: 'transform',
      name: 'Identify Underperformers',
      config: {
        script: `
          const processed = analyticsRows.map(row => ({
            video: row[0],
            views: row[1],
            estimatedMinutesWatched: row[2],
            averageViewDuration: row[3],
            averageViewPercentage: row[4],
            viewsPerDay: row[1] / 90
          }));
          // Sort ascending to get worst performers first (API gives us descending)
          processed.sort((a, b) => a.viewsPerDay - b.viewsPerDay);
          return {
            worstIds: processed.slice(0, 5).map(p => p.video),
            worstMetrics: processed.slice(0, 5),
            primaryLoserId: processed[0]?.video
          };
        `
      },
      inputs: {
        analyticsRows: '$steps.fetch-analytics.analyticsRows'
      },
      outputs: ['worstIds', 'worstMetrics', 'primaryLoserId'],
      dependencies: ['fetch-analytics']
    },
    {
      id: 'fetch-underperformer-details',
      type: 'youtube-api',
      name: 'Fetch Underperformer Details',
      config: {
        endpoint: 'videos',
        params: {
          part: 'snippet,contentDetails,statistics'
        }
      },
      inputs: {
        accessToken: '$input.accessToken',
        videoIds: '$steps.identify-underperformers.worstIds'
      },
      outputs: ['videoDetails'],
      dependencies: ['identify-underperformers']
    },
    {
      id: 'extract-underperformer-title',
      type: 'transform',
      name: 'Extract Underperformer Title',
      config: {
        script: `
          return {
            title: videoDetails[0]?.title || 'Unknown video'
          };
        `
      },
      inputs: {
        videoDetails: '$steps.fetch-underperformer-details.videoDetails'
      },
      outputs: ['title'],
      dependencies: ['fetch-underperformer-details']
    },
    {
      id: 'diagnose-issues',
      type: 'openai',
      name: 'Diagnose Performance Issues',
      config: {
        model: 'gpt-4o-mini',
        system: 'You are Neria, a YouTube optimization expert. Analyze underperforming content to identify improvement opportunities.',
        maxTokens: 120
      },
      inputs: {
        prompt: 'Analyze why this content underperformed: "{{title}}". What themes or approaches should be avoided or improved?',
        title: '$steps.extract-underperformer-title.title'
      },
      outputs: ['diagnosis'],
      dependencies: ['extract-underperformer-title']
    },
    {
      id: 'format-result',
      type: 'transform',
      name: 'Format Underperformer Data',
      config: {
        script: `
          const worstVideo = videoDetails[0];
          const worstMetricsData = worstMetrics[0];
          
          return {
            primaryLoser: worstVideo ? {
              id: worstVideo.id,
              title: worstVideo.title,
              thumb: worstVideo.thumbnails?.high?.url || worstVideo.thumbnails?.medium?.url || worstVideo.thumbnails?.default?.url || '',
              publishedAt: worstVideo.publishedAt,
              duration: worstVideo.duration,
              metrics: {
                views: worstMetricsData?.views || worstVideo.viewCount,
                viewsPerDay: worstMetricsData?.viewsPerDay || 0,
                avgViewDur: worstMetricsData?.averageViewDuration || 0,
                avgViewPct: worstMetricsData?.averageViewPercentage || 0
              }
            } : null,
            loserIds: worstIds,
            diagnosis: diagnosis || "This type of content is dragging down performance relative to your baseline. We should avoid or radically reframe this theme going forward."
          };
        `
      },
      inputs: {
        videoDetails: '$steps.fetch-underperformer-details.videoDetails',
        worstMetrics: '$steps.identify-underperformers.worstMetrics',
        worstIds: '$steps.identify-underperformers.worstIds',
        diagnosis: '$steps.diagnose-issues.diagnosis'
      },
      outputs: ['result'],
      dependencies: ['fetch-underperformer-details', 'identify-underperformers', 'diagnose-issues']
    }
  ]
};

export default underperformerAnalysis;
