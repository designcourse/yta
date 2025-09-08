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
        channelId: '$input.channelId',
        channelTitle: '$steps.run-channel-overview.result.channel.title'
      },
      outputs: ['topPerformerResult'],
      dependencies: ['run-channel-overview']
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
          return {
            channel: channelOverview?.channel || {},
            analytics90d: topPerformer?.analytics90d || {},
            winners: topPerformer?.winners || [],
            loserIds: underperformer?.loserIds || [],
            primaryLoserId: underperformer?.primaryLoser?.id,
            slide1Text: channelOverview?.greeting || 'No greeting available',
            slide2Text: topPerformer?.themeAnalysis || 'No theme analysis available',
            slide3Text: underperformer?.diagnosis || 'No diagnosis available'
          };
        `
      },
      inputs: {
        channelOverview: '$steps.run-channel-overview.channelResult',
        topPerformer: '$steps.run-top-performer-analysis.topPerformerResult', 
        underperformer: '$steps.run-underperformer-analysis.underperformerResult'
      },
      outputs: ['result'],
      dependencies: ['run-channel-overview', 'run-top-performer-analysis', 'run-underperformer-analysis']
    }
  ]
};

export default collectionComposer;
