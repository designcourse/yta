import { Workflow } from '../types';
import youtubeCollectionAnalytics from './youtube-collection-analytics';
import competitorAnalysis from './competitor-analysis';
import channelOverview from './channel-overview';
import topPerformerAnalysis from './top-performer-analysis';
import underperformerAnalysis from './underperformer-analysis';
import collectionComposer from './collection-composer';

const workflows: Record<string, Workflow> = {
  'youtube-collection-analytics': youtubeCollectionAnalytics,
  'competitor-analysis': competitorAnalysis,
  'channel-overview': channelOverview,
  'top-performer-analysis': topPerformerAnalysis,
  'underperformer-analysis': underperformerAnalysis,
  'collection-composer': collectionComposer,
};

export default workflows;
