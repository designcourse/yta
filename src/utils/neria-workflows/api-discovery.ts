// API Discovery System - Automatically discover available endpoints
export interface APIEndpoint {
  id: string;
  name: string;
  description: string;
  category: 'youtube' | 'openai' | 'database' | 'external';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  inputs: APIParameter[];
  outputs: APIParameter[];
  example?: any;
}

export interface APIParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  default?: any;
}

// Discovered API endpoints from your app
export const discoveredEndpoints: APIEndpoint[] = [
  // YouTube API Endpoints
  {
    id: 'youtube-channels',
    name: 'Get Channel Info',
    description: 'Retrieve channel metadata and statistics',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/channels',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'channelId', type: 'string', required: true, description: 'YouTube channel ID' },
      { name: 'part', type: 'string', required: false, description: 'Data parts to include', default: 'snippet,statistics' }
    ],
    outputs: [
      { name: 'channelData', type: 'object', required: true, description: 'Channel information and stats' }
    ],
    example: { id: 'UC123', title: 'My Channel', subscriberCount: 1000 }
  },
  {
    id: 'youtube-playlists',
    name: 'List Playlists',
    description: 'Retrieve playlists for a channel or by IDs',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/playlists',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'channelId', type: 'string', required: false, description: 'Channel ID to list playlists for' },
      { name: 'playlistIds', type: 'array', required: false, description: 'Specific playlist IDs' },
      { name: 'part', type: 'string', required: false, description: 'Data parts to include', default: 'snippet,contentDetails' },
      { name: 'maxResults', type: 'number', required: false, description: 'Max results per page', default: 50 }
    ],
    outputs: [
      { name: 'playlists', type: 'array', required: true, description: 'Playlist items' }
    ]
  },
  {
    id: 'youtube-playlist-items',
    name: 'List Playlist Items',
    description: 'Retrieve videos within a playlist',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/playlist-items',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'playlistId', type: 'string', required: true, description: 'Playlist ID' },
      { name: 'part', type: 'string', required: false, description: 'Data parts to include', default: 'snippet,contentDetails' },
      { name: 'maxResults', type: 'number', required: false, description: 'Max results per page', default: 50 }
    ],
    outputs: [
      { name: 'playlistItems', type: 'array', required: true, description: 'Playlist items with video references' }
    ]
  },
  {
    id: 'youtube-subscriptions',
    name: 'List Subscriptions',
    description: 'Retrieve subscriptions for the authenticated user or a channel',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/subscriptions',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'channelId', type: 'string', required: false, description: 'Channel ID (for target channel subscriptions)' },
      { name: 'mine', type: 'boolean', required: false, description: 'List current user subscriptions', default: true },
      { name: 'part', type: 'string', required: false, description: 'Data parts to include', default: 'snippet,contentDetails' }
    ],
    outputs: [
      { name: 'subscriptions', type: 'array', required: true, description: 'Subscription list' }
    ]
  },
  {
    id: 'youtube-comments',
    name: 'List Comments',
    description: 'Retrieve comments for a video',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/comments',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'videoId', type: 'string', required: true, description: 'Video ID to fetch comments for' },
      { name: 'part', type: 'string', required: false, description: 'Data parts to include', default: 'snippet' },
      { name: 'maxResults', type: 'number', required: false, description: 'Max results per page', default: 50 }
    ],
    outputs: [
      { name: 'comments', type: 'array', required: true, description: 'Comments with author and text' }
    ]
  },
  {
    id: 'youtube-comment-threads',
    name: 'List Comment Threads',
    description: 'Retrieve comment threads for a video',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/comment-threads',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'videoId', type: 'string', required: true, description: 'Video ID to fetch threads for' },
      { name: 'part', type: 'string', required: false, description: 'Data parts to include', default: 'snippet,replies' },
      { name: 'maxResults', type: 'number', required: false, description: 'Max results per page', default: 50 }
    ],
    outputs: [
      { name: 'commentThreads', type: 'array', required: true, description: 'Top-level comments with replies' }
    ]
  },
  {
    id: 'youtube-captions',
    name: 'List Captions',
    description: 'Retrieve caption tracks for a video',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/captions',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'videoId', type: 'string', required: true, description: 'Video ID' }
    ],
    outputs: [
      { name: 'captions', type: 'array', required: true, description: 'Caption tracks metadata' }
    ]
  },
  {
    id: 'youtube-analytics',
    name: 'Get Analytics Data',
    description: 'Fetch YouTube Analytics reports',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/analytics',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'channelId', type: 'string', required: true, description: 'YouTube channel ID' },
      { name: 'metrics', type: 'string', required: true, description: 'Metrics to fetch' },
      { name: 'dimensions', type: 'string', required: false, description: 'Dimensions for grouping' },
      { name: 'days', type: 'number', required: false, description: 'Days to look back', default: 30 }
    ],
    outputs: [
      { name: 'analyticsRows', type: 'array', required: true, description: 'Analytics data rows' },
      { name: 'columnHeaders', type: 'array', required: true, description: 'Column definitions' }
    ]
  },
  {
    id: 'youtube-analytics-groups',
    name: 'Analytics Groups',
    description: 'Manage Analytics groups and items',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/analytics/groups',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'action', type: 'string', required: true, description: 'list|insert|update|delete' },
      { name: 'groupId', type: 'string', required: false, description: 'Target group ID' },
      { name: 'title', type: 'string', required: false, description: 'Group title (for insert/update)' }
    ],
    outputs: [
      { name: 'groups', type: 'array', required: true, description: 'Analytics groups' }
    ]
  },
  {
    id: 'youtube-analytics-group-items',
    name: 'Analytics Group Items',
    description: 'Manage items within an Analytics group',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/analytics/group-items',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'action', type: 'string', required: true, description: 'list|insert|delete' },
      { name: 'groupId', type: 'string', required: true, description: 'Group ID' },
      { name: 'resourceId', type: 'string', required: false, description: 'Resource to add/remove' }
    ],
    outputs: [
      { name: 'groupItems', type: 'array', required: true, description: 'Items in the group' }
    ]
  },
  {
    id: 'youtube-videos',
    name: 'Get Video Details',
    description: 'Fetch detailed video information',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/videos',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'videoIds', type: 'array', required: true, description: 'Array of video IDs' },
      { name: 'part', type: 'string', required: false, description: 'Data parts to include', default: 'snippet,statistics' }
    ],
    outputs: [
      { name: 'videoDetails', type: 'array', required: true, description: 'Video information array' }
    ]
  },
  {
    id: 'youtube-search',
    name: 'Search YouTube',
    description: 'Search for videos, channels, or playlists',
    category: 'youtube',
    method: 'GET',
    path: '/api/youtube/search',
    inputs: [
      { name: 'accessToken', type: 'string', required: true, description: 'OAuth access token' },
      { name: 'query', type: 'string', required: true, description: 'Search query' },
      { name: 'type', type: 'string', required: false, description: 'Search type (video, channel, playlist)', default: 'video' },
      { name: 'maxResults', type: 'number', required: false, description: 'Maximum results', default: 25 }
    ],
    outputs: [
      { name: 'searchResults', type: 'array', required: true, description: 'Search results array' }
    ]
  },

  // OpenAI Endpoints
  {
    id: 'openai-chat',
    name: 'AI Chat Completion',
    description: 'Generate AI responses using OpenAI',
    category: 'openai',
    method: 'POST',
    path: '/api/openai/chat',
    inputs: [
      { name: 'prompt', type: 'string', required: true, description: 'User prompt' },
      { name: 'system', type: 'string', required: false, description: 'System message' },
      { name: 'model', type: 'string', required: false, description: 'AI model to use', default: 'gpt-4o-mini' },
      { name: 'maxTokens', type: 'number', required: false, description: 'Maximum response tokens', default: 150 }
    ],
    outputs: [
      { name: 'response', type: 'string', required: true, description: 'AI generated response' }
    ]
  },
  {
    id: 'openai-analysis',
    name: 'Content Analysis',
    description: 'Analyze content with AI',
    category: 'openai',
    method: 'POST',
    path: '/api/openai/analyze',
    inputs: [
      { name: 'content', type: 'string', required: true, description: 'Content to analyze' },
      { name: 'analysisType', type: 'string', required: true, description: 'Type of analysis (sentiment, themes, keywords)', default: 'themes' }
    ],
    outputs: [
      { name: 'analysis', type: 'object', required: true, description: 'Analysis results' }
    ]
  },

  // Database Endpoints
  {
    id: 'db-save-data',
    name: 'Save to Database',
    description: 'Store data in Supabase database',
    category: 'database',
    method: 'POST',
    path: '/api/database/save',
    inputs: [
      { name: 'table', type: 'string', required: true, description: 'Database table name' },
      { name: 'data', type: 'object', required: true, description: 'Data to save' }
    ],
    outputs: [
      { name: 'saved', type: 'object', required: true, description: 'Saved data with ID' }
    ]
  },
  {
    id: 'db-query-data',
    name: 'Query Database',
    description: 'Retrieve data from database',
    category: 'database',
    method: 'GET',
    path: '/api/database/query',
    inputs: [
      { name: 'table', type: 'string', required: true, description: 'Database table name' },
      { name: 'filters', type: 'object', required: false, description: 'Query filters' },
      { name: 'limit', type: 'number', required: false, description: 'Result limit', default: 100 }
    ],
    outputs: [
      { name: 'results', type: 'array', required: true, description: 'Query results' }
    ]
  },

  // Transform/Utility Endpoints
  {
    id: 'transform-data',
    name: 'Transform Data',
    description: 'Apply JavaScript transformations to data',
    category: 'external',
    method: 'POST',
    path: '/internal/transform',
    inputs: [
      { name: 'data', type: 'object', required: true, description: 'Input data to transform' },
      { name: 'script', type: 'string', required: true, description: 'JavaScript transformation code' }
    ],
    outputs: [
      { name: 'transformed', type: 'object', required: true, description: 'Transformed data' }
    ]
  },
  {
    id: 'http-request',
    name: 'HTTP Request',
    description: 'Make external HTTP requests',
    category: 'external',
    method: 'POST',
    path: '/internal/http',
    inputs: [
      { name: 'url', type: 'string', required: true, description: 'Request URL' },
      { name: 'method', type: 'string', required: false, description: 'HTTP method', default: 'GET' },
      { name: 'headers', type: 'object', required: false, description: 'Request headers' },
      { name: 'body', type: 'object', required: false, description: 'Request body' }
    ],
    outputs: [
      { name: 'response', type: 'object', required: true, description: 'HTTP response' }
    ]
  }
];

// Get endpoints by category
export const getEndpointsByCategory = (category: string): APIEndpoint[] => {
  return discoveredEndpoints.filter(endpoint => endpoint.category === category);
};

// Get all categories
export const getCategories = (): string[] => {
  return [...new Set(discoveredEndpoints.map(endpoint => endpoint.category))];
};

// Find endpoint by ID
export const getEndpointById = (id: string): APIEndpoint | undefined => {
  return discoveredEndpoints.find(endpoint => endpoint.id === id);
};
