import { Workflow } from '../types';

const collectionComposer: Workflow = {
  id: 'collection-composer',
  name: 'Collection Slide Composer',
  version: '1.0.0',
  description: 'Orchestrates all collection slides using modular workflows',
  triggers: [
    {
      type: 'manual',
      config: {}
    }
  ],
  steps: [
    {
      id: 'run-channel-overview',
      type: 'workflow',
      name: 'Run Channel Overview',
      config: {
        workflowId: 'channel-overview'
      },
      inputs: {
        accessToken: '$input.accessToken',
        channelId: '$input.channelId'
      },
      outputs: ['channelResult'],
      dependencies: []
    },
    {
      id: 'run-top-performer-analysis',
      type: 'workflow',
      name: 'Run Top Performer Analysis',
      config: {
        workflowId: 'top-performer-analysis'
      },
      inputs: {
        accessToken: '$input.accessToken',
        channelId: '$input.channelId'
      },
      outputs: ['topPerformerResult'],
      dependencies: []
    },
    {
      id: 'run-underperformer-analysis',
      type: 'workflow',
      name: 'Run Underperformer Analysis',
      config: {
        workflowId: 'underperformer-analysis'
      },
      inputs: {
        accessToken: '$input.accessToken',
        channelId: '$input.channelId'
      },
      outputs: ['underperformerResult'],
      dependencies: []
    },
    {
      id: 'compose-final-result',
      type: 'transform',
      name: 'Compose Collection Data',
      config: {
        script: `
          // Extract results from workflow step outputs
          const channelData = channelOverview?.outputs?.channelResult || channelOverview?.channelResult || channelOverview;
          const topData = topPerformer?.outputs?.topPerformerResult || topPerformer?.topPerformerResult || topPerformer;
          const underData = underperformer?.outputs?.underperformerResult || underperformer?.underperformerResult || underperformer;
          
          return {
            channel: channelData?.channel || {},
            analytics90d: topData?.analytics90d || {},
            winners: topData?.winners || [],
            loserIds: underData?.loserIds || [],
            primaryLoserId: underData?.primaryLoser?.id,
            slide1Text: channelData?.greeting || 'No greeting available',
            slide2Text: topData?.themeAnalysis || 'No theme analysis available',
            slide3Text: underData?.diagnosis || 'No diagnosis available'
          };
        `
      },
      inputs: {
        channelOverview: '$steps.run-channel-overview',
        topPerformer: '$steps.run-top-performer-analysis', 
        underperformer: '$steps.run-underperformer-analysis'
      },
      outputs: ['result'],
      dependencies: ['run-channel-overview', 'run-top-performer-analysis', 'run-underperformer-analysis']
    }
  ]
};

export default collectionComposer;
