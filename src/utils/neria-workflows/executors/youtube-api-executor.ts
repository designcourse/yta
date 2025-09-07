import { BaseExecutor } from './base-executor';
import { WorkflowStep, ExecutionContext, YouTubeApiConfig } from '../types';

export class YouTubeApiExecutor extends BaseExecutor {
  async execute(
    step: WorkflowStep, 
    inputs: Record<string, any>, 
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    this.logStep(step.id, `Executing YouTube API call: ${step.name}`);
    
    const config = step.config as YouTubeApiConfig;
    const { accessToken, channelId, videoIds } = inputs;

    if (!accessToken) {
      throw new Error('Access token is required for YouTube API calls');
    }

    switch (config.endpoint) {
      case 'channels':
        return this.fetchChannelData(accessToken, config.params);
      
      case 'videos':
        return this.fetchVideoDetails(accessToken, videoIds, config.params);
      
      case 'analytics-reports':
        return this.fetchAnalyticsData(accessToken, channelId, config.params);
      
      case 'search':
        return this.searchVideos(accessToken, config.params);
      
      default:
        throw new Error(`Unsupported YouTube API endpoint: ${config.endpoint}`);
    }
  }

  private async fetchChannelData(accessToken: string, params: any): Promise<Record<string, any>> {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    
    // Set default params
    url.searchParams.set('part', params.part || 'snippet,statistics');
    url.searchParams.set('mine', 'true');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const channel = data.items?.[0];

    if (!channel) {
      throw new Error('No channel data found');
    }

    return {
      channelData: {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        thumbnails: channel.snippet.thumbnails,
        subscriberCount: parseInt(channel.statistics.subscriberCount || '0'),
        videoCount: parseInt(channel.statistics.videoCount || '0'),
        viewCount: parseInt(channel.statistics.viewCount || '0'),
      }
    };
  }

  private async fetchVideoDetails(accessToken: string, videoIds: string[], params: any): Promise<Record<string, any>> {
    if (!videoIds || videoIds.length === 0) {
      return { videoDetails: [] };
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', params.part || 'snippet,contentDetails,statistics');
    url.searchParams.set('id', videoIds.join(','));

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      videoDetails: data.items?.map((video: any) => ({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnails: video.snippet.thumbnails,
        publishedAt: video.snippet.publishedAt,
        duration: video.contentDetails.duration,
        viewCount: parseInt(video.statistics?.viewCount || '0'),
        likeCount: parseInt(video.statistics?.likeCount || '0'),
        commentCount: parseInt(video.statistics?.commentCount || '0'),
      })) || []
    };
  }

  private async fetchAnalyticsData(accessToken: string, channelId: string, params: any): Promise<Record<string, any>> {
    if (!channelId) {
      throw new Error('Channel ID is required for analytics data');
    }

    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    
    // Calculate date range
    const days = params.days || 90;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    url.searchParams.set('ids', `channel==${channelId}`);
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate', endDate);
    url.searchParams.set('metrics', params.metrics || 'views,estimatedMinutesWatched,averageViewDuration');
    url.searchParams.set('dimensions', params.dimensions || 'video');
    url.searchParams.set('sort', params.sort || '-views');
    url.searchParams.set('maxResults', (params.maxResults || 200).toString());

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube Analytics API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      analyticsRows: data.rows || [],
      columnHeaders: data.columnHeaders || [],
    };
  }

  private async searchVideos(accessToken: string, params: any): Promise<Record<string, any>> {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', (params.maxResults || 50).toString());
    
    if (params.q) {
      url.searchParams.set('q', params.q);
    }
    if (params.channelId) {
      url.searchParams.set('channelId', params.channelId);
    }
    if (params.order) {
      url.searchParams.set('order', params.order);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      searchResults: data.items?.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnails: item.snippet.thumbnails,
        publishedAt: item.snippet.publishedAt,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
      })) || []
    };
  }
}
