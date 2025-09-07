import { Workflow } from '../types';
import youtubeCollectionAnalytics from './youtube-collection-analytics';
import competitorAnalysis from './competitor-analysis';

const workflows: Record<string, Workflow> = {
  'youtube-collection-analytics': youtubeCollectionAnalytics,
  'competitor-analysis': competitorAnalysis,
};

export default workflows;
