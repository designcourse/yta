'use client';

import { useState } from 'react';

type WorkflowStep = {
  id: string;
  status: 'completed' | 'failed' | 'pending' | 'skipped';
  result?: any;
  error?: {
    message: string;
    timestamp: string;
  };
};

type WorkflowFlowDiagramProps = {
  steps: WorkflowStep[];
  workflowId: string;
};

export default function WorkflowFlowDiagram({ steps, workflowId }: WorkflowFlowDiagramProps) {
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500 border-green-600';
      case 'failed': return 'bg-red-500 border-red-600';
      case 'pending': return 'bg-blue-500 border-blue-600 animate-pulse';
      case 'running': return 'bg-yellow-500 border-yellow-600 animate-pulse';
      default: return 'bg-gray-300 border-gray-400';
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'pending': return '⏳';
      case 'running': return '⚡';
      default: return '○';
    }
  };

  const getStepName = (stepId: string) => {
    const names: Record<string, string> = {
      'fetch-channel': 'Fetch Channel',
      'fetch-analytics': 'Get Analytics',
      'process-winners': 'Process Data',
      'fetch-video-details': 'Get Videos',
      'generate-insights': 'AI Insights',
      'build-response': 'Build Response',
    };
    return names[stepId] || stepId;
  };

  const getStepDescription = (stepId: string) => {
    const descriptions: Record<string, string> = {
      'fetch-channel': 'Retrieve channel metadata from YouTube API',
      'fetch-analytics': 'Get 90-day analytics data from YouTube Analytics',
      'process-winners': 'Calculate top and bottom performers by views/day',
      'fetch-video-details': 'Fetch detailed video information',
      'generate-insights': 'Generate AI-powered insights in parallel',
      'build-response': 'Combine all data into final response',
    };
    return descriptions[stepId] || 'Workflow step execution';
  };

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Workflow Flow</h3>
      
      <div className="flex flex-col space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center space-x-4">
            {/* Step Circle */}
            <div
              className={`
                relative flex items-center justify-center w-12 h-12 rounded-full border-2 cursor-pointer
                ${getStepColor(step.status)}
                hover:scale-105 transition-transform
              `}
              onClick={() => setSelectedStep(step)}
              title={getStepName(step.id)}
            >
              <span className="text-white font-bold text-lg">
                {getStepIcon(step.status)}
              </span>
              {step.status === 'running' && (
                <div className="absolute inset-0 rounded-full border-2 border-blue-300 animate-ping"></div>
              )}
            </div>

            {/* Step Info */}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">{getStepName(step.id)}</h4>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  step.status === 'completed' ? 'text-green-700 bg-green-100' :
                  step.status === 'failed' ? 'text-red-700 bg-red-100' :
                  step.status === 'pending' ? 'text-blue-700 bg-blue-100' :
                  'text-gray-700 bg-gray-100'
                }`}>
                  {step.status}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{getStepDescription(step.id)}</p>
              {step.error && (
                <p className="text-sm text-red-600 mt-1">
                  Error: {step.error.message}
                </p>
              )}
            </div>

            {/* Connection Line */}
            {index < steps.length - 1 && (
              <div className="absolute left-6 mt-12 w-0.5 h-8 bg-gray-300 z-0"></div>
            )}
          </div>
        ))}
      </div>

      {/* Step Details Modal */}
      {selectedStep && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl max-h-96 overflow-y-auto m-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{getStepName(selectedStep.id)}</h3>
              <button
                onClick={() => setSelectedStep(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <span className="font-medium">Status: </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  selectedStep.status === 'completed' ? 'text-green-700 bg-green-100' :
                  selectedStep.status === 'failed' ? 'text-red-700 bg-red-100' :
                  selectedStep.status === 'pending' ? 'text-blue-700 bg-blue-100' :
                  'text-gray-700 bg-gray-100'
                }`}>
                  {selectedStep.status}
                </span>
              </div>

              <div>
                <span className="font-medium">Description: </span>
                <p className="text-gray-600 mt-1">{getStepDescription(selectedStep.id)}</p>
              </div>

              {selectedStep.error && (
                <div>
                  <span className="font-medium text-red-600">Error: </span>
                  <p className="text-red-600 mt-1">{selectedStep.error.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(selectedStep.error.timestamp).toLocaleString()}
                  </p>
                </div>
              )}

              {selectedStep.result && selectedStep.status === 'completed' && (
                <div>
                  <span className="font-medium">Result: </span>
                  <div className="bg-gray-50 p-3 rounded mt-2 text-sm font-mono max-h-40 overflow-y-auto">
                    <pre>{JSON.stringify(selectedStep.result, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
