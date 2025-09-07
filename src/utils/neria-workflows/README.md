# Neria Workflow Engine

A local workflow engine for the YouTube Analytics App that provides complex data processing flows with visual representation and monitoring, specifically optimized for Neria's AI-powered analytics.

## Architecture

### Core Components

- **Workflow Definition System**: JSON-based workflow definitions stored in codebase
- **Step Execution Engine**: Local execution with parallel processing and dependency resolution
- **Step Executors**: Specialized executors for different step types
- **Monitoring & Logging**: Built-in step tracking, timing, and error handling

### Step Types

#### YouTube API Steps (`youtube-api`)
- `channels`: Fetch channel information
- `videos`: Batch fetch video metadata
- `analytics-reports`: Get analytics data with date ranges
- `search`: Search for videos/channels

#### AI Processing Steps (`openai`)
- Generic OpenAI chat completion with template variable support
- Integrates with existing OpenAI utility
- Supports system prompts and configuration

#### Transform Steps (`transform`)
- Execute JavaScript code with safe context
- Utility functions: formatNumber, sortBy, groupBy, sum, average, median
- Access to workflow inputs and previous step results

#### Parallel Steps (`parallel`)
- Execute multiple steps simultaneously
- Combine outputs from all parallel steps
- Fail if any parallel step fails

## Usage

### API Endpoints

- `GET /api/neria-workflows` - List available workflows
- `GET /api/neria-workflows/{workflowId}` - Get workflow definition
- `POST /api/neria-workflows/{workflowId}` - Execute workflow
- `GET /api/neria-workflows/status` - System status
- `GET /api/neria-workflows/test` - Test system functionality

### Workflow Definition Example

```typescript
const workflow: Workflow = {
  id: 'my-workflow',
  name: 'My Workflow',
  version: '1.0.0',
  description: 'Example workflow',
  triggers: [{ type: 'manual', config: {} }],
  steps: [
    {
      id: 'fetch-data',
      type: 'youtube-api',
      name: 'Fetch Channel Data',
      config: {
        endpoint: 'channels',
        params: { part: 'snippet,statistics', mine: true }
      },
      inputs: {
        accessToken: '$input.accessToken'
      },
      outputs: ['channelData'],
      dependencies: []
    },
    {
      id: 'process-data',
      type: 'transform',
      name: 'Process Data',
      config: {
        script: `
          return {
            processedTitle: channelData.title.toUpperCase(),
            subscriberCount: formatNumber(channelData.subscriberCount)
          };
        `
      },
      inputs: {
        channelData: '$steps.fetch-data.channelData'
      },
      outputs: ['processedTitle', 'subscriberCount'],
      dependencies: ['fetch-data']
    }
  ]
};
```

### Input/Output Resolution

- `$input.{key}` - Access workflow input parameters
- `$steps.{stepId}.{outputKey}` - Access outputs from previous steps
- `{{variable}}` - Template variable substitution in strings
- `{{steps.stepId.outputKey}}` - Template access to step outputs
- `{{input.key}}` - Template access to workflow inputs

### Transform Step Utilities

Available in transform step execution context:

- `formatNumber(num)` - Format numbers (1234 → "1.2k")
- `sortBy(array, keyFn, reverse?)` - Sort array by key function
- `groupBy(array, keyFn)` - Group array by key function
- `sum(numbers)` - Sum array of numbers
- `average(numbers)` - Average of numbers
- `median(numbers)` - Median of numbers
- `Math`, `Date`, `JSON` - Standard JavaScript objects

### Error Handling

- Steps fail individually with detailed error messages
- Workflow execution stops on first step failure
- Parallel steps fail if any sub-step fails
- Comprehensive error logging and reporting

### Integration

The workflow system integrates with:

- **Existing APIs**: Uses current YouTube and OpenAI utilities
- **Authentication**: Respects Supabase auth and RLS
- **Caching**: Compatible with existing cache strategies
- **Collection System**: Powers the `/collection` preview with workflows

## Current Workflows

### youtube-collection-analytics

Complete YouTube channel analysis for collection page:

1. **fetch-channel**: Get channel data from YouTube API
2. **fetch-analytics**: Get 90-day analytics data
3. **process-winners**: Calculate top/bottom performers by viewsPerDay
4. **fetch-video-details**: Get metadata for top performing videos
5. **generate-insights**: Parallel AI text generation for slides
6. **build-response**: Combine all data into final response

## Testing

Use the test endpoint to validate system functionality:

```bash
curl -X GET /api/neria-workflows/test
```

Check system status:

```bash
curl -X GET /api/neria-workflows/status
```

## Future Enhancements

- Visual workflow editor
- Conditional step execution
- Loop/batch processing steps
- Webhook triggers
- Scheduled execution
- Workflow composition and reusability
- Real-time progress updates
- Performance metrics and optimization
