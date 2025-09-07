'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import WorkflowFlowDiagram from '@/components/WorkflowFlowDiagram';

type WorkflowExecution = {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  stepResults: Record<string, any>;
  errors: Array<{
    stepId: string;
    message: string;
    timestamp: string;
    stack?: string;
  }>;
};

type WorkflowStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: string;
  avgDuration: number;
};

export default function WorkflowsPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecution | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [showFullResults, setShowFullResults] = useState(false);

  const fetchExecutions = async () => {
    try {
      const res = await fetch('/api/neria-workflows/executions?limit=100');
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.executions);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerWorkflow = async (workflowId: string) => {
    setTriggering(true);
    try {
      // Prepare different inputs based on workflow type
      let inputs: any = { channelId };
      
      if (workflowId === 'competitor-analysis') {
        const searchQuery = prompt('Enter search query for competitors (e.g., "web design tutorials"):');
        if (!searchQuery) {
          setTriggering(false);
          return;
        }
        inputs.searchQuery = searchQuery;
        inputs.myChannelStats = {
          subscribers: 1150000, // This would come from your channel data
          avgViews: 50000
        };
      }
      
      const res = await fetch(`/api/neria-workflows/trigger/${workflowId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(`Workflow "${workflowId}" triggered! Execution ID: ${data.executionId}`);
        fetchExecutions(); // Refresh to show new execution
      } else {
        const error = await res.json();
        alert(`Failed to trigger workflow: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to trigger workflow:', error);
      alert('Failed to trigger workflow');
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchExecutions, 5000); // Refresh every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'running': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = end.getTime() - start.getTime();
    
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${(duration / 60000).toFixed(1)}m`;
  };

  const getStepDescription = (stepId: string) => {
    const descriptions: Record<string, string> = {
      // YouTube Collection Analytics
      'fetch-channel': 'Retrieve channel metadata from YouTube API',
      'fetch-analytics': 'Get 90-day analytics data from YouTube Analytics',
      'process-winners': 'Calculate top and bottom performers by views/day',
      'fetch-video-details': 'Fetch detailed video information',
      'generate-insights': 'Generate AI-powered insights in parallel',
      'build-response': 'Combine all data into final response',
      
      // Competitor Analysis
      'search-competitors': 'Search for competitor channels based on query',
      'fetch-competitor-videos': 'Get top performing videos from competitors',
      'analyze-competitor-strategies': 'AI analysis of competitor content strategies',
      'compare-performance': 'Compare metrics against your channel',
      'generate-recommendations': 'AI-generated strategy recommendations',
    };
    return descriptions[stepId] || 'Workflow step execution';
  };

  const getWorkflowSteps = (execution: WorkflowExecution) => {
    const stepIds = Object.keys(execution.stepResults);
    
    // Define expected step order for each workflow
    const workflowSteps: Record<string, string[]> = {
      'youtube-collection-analytics': [
        'fetch-channel',
        'fetch-analytics', 
        'process-winners',
        'fetch-video-details',
        'generate-insights',
        'build-response'
      ],
      'competitor-analysis': [
        'search-competitors',
        'fetch-competitor-videos',
        'analyze-competitor-strategies',
        'compare-performance',
        'generate-recommendations'
      ]
    };
    
    const workflow = workflowSteps[execution.workflowId] || stepIds;
    
    return workflow.map(stepId => ({
      id: stepId,
      status: execution.stepResults[stepId] ? 'completed' : 
              execution.errors.some(e => e.stepId === stepId) ? 'failed' : 
              execution.status === 'running' ? 'pending' : 'skipped',
      result: execution.stepResults[stepId],
      error: execution.errors.find(e => e.stepId === stepId),
    }));
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Workflow Monitor</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">Auto refresh</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={fetchExecutions}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Refresh
              </button>
              <div className="relative">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      triggerWorkflow(e.target.value);
                      e.target.value = ''; // Reset selection
                    }
                  }}
                  disabled={triggering}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm cursor-pointer"
                >
                  <option value="">{triggering ? 'Triggering...' : 'Run Workflow'}</option>
                  <option value="youtube-collection-analytics">Collection Analytics</option>
                  <option value="competitor-analysis">Competitor Analysis</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Executions</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold text-blue-600">{stats.running}</div>
              <div className="text-sm text-gray-600">Running</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold text-gray-900">{stats.successRate}%</div>
              <div className="text-sm text-gray-600">Success Rate</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Executions List */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Recent Executions</h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {executions.map(execution => (
              <div
                key={execution.id}
                className={`p-4 cursor-pointer hover:bg-gray-50 ${
                  selectedExecution?.id === execution.id ? 'bg-blue-50' : ''
                }`}
                onClick={() => setSelectedExecution(execution)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(execution.status)}`}>
                      {execution.status}
                    </span>
                    <span className="text-sm font-medium">{execution.workflowId}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDuration(execution.startTime, execution.endTime)}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(execution.startTime).toLocaleString()}
                </div>
                {execution.errors.length > 0 && (
                  <div className="text-xs text-red-600 mt-1 truncate">
                    {execution.errors[0].message}
                  </div>
                )}
              </div>
            ))}
            {executions.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No workflow executions found
              </div>
            )}
          </div>
        </div>

        {/* Execution Details */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">
              {selectedExecution ? 'Execution Details' : 'Select an execution'}
            </h2>
          </div>
          <div className="p-4">
            {selectedExecution ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">ID:</span>
                    <div className="font-mono text-xs text-gray-600 break-all">
                      {selectedExecution.id}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Workflow:</span>
                    <div>{selectedExecution.workflowId}</div>
                  </div>
                  <div>
                    <span className="font-medium">Started:</span>
                    <div>{new Date(selectedExecution.startTime).toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="font-medium">Duration:</span>
                    <div>{formatDuration(selectedExecution.startTime, selectedExecution.endTime)}</div>
                  </div>
                </div>

                {/* Step Flow Diagram */}
                <WorkflowFlowDiagram 
                  steps={getWorkflowSteps(selectedExecution)} 
                  workflowId={selectedExecution.workflowId}
                />

                {/* Errors */}
                {selectedExecution.errors.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3 text-red-600">Errors</h3>
                    <div className="space-y-2">
                      {selectedExecution.errors.map((error, index) => (
                        <div key={index} className="bg-red-50 p-3 rounded text-sm">
                          <div className="font-medium text-red-700">{error.stepId}</div>
                          <div className="text-red-600">{error.message}</div>
                          <div className="text-xs text-red-500 mt-1">
                            {new Date(error.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step Results Preview */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">Step Results</h3>
                    <button
                      onClick={() => setShowFullResults(true)}
                      className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      Expand
                    </button>
                  </div>
                  <div className="bg-gray-50 p-3 rounded text-xs font-mono max-h-40 overflow-y-auto">
                    <pre>{JSON.stringify(selectedExecution.stepResults, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                Click on an execution to view details
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full Screen Results Modal */}
      {showFullResults && selectedExecution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full h-full max-w-7xl max-h-full flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-semibold">Step Results - {selectedExecution.workflowId}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Execution ID: {selectedExecution.id}
                </p>
              </div>
              <button
                onClick={() => setShowFullResults(false)}
                className="text-gray-400 hover:text-gray-600 p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-6 overflow-hidden">
              <div className="h-full overflow-y-auto space-y-4">
                {Object.entries(selectedExecution.stepResults).map(([stepId, result]) => (
                  <div key={stepId} className="bg-white border rounded-lg">
                    <div className="bg-gray-50 px-4 py-3 border-b rounded-t-lg">
                      <h3 className="font-medium text-gray-900 flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        {stepId}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {getStepDescription(stepId)}
                      </p>
                    </div>
                    <div className="p-4">
                      <div className="bg-gray-50 rounded p-3 max-h-60 overflow-y-auto relative group">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                            alert(`${stepId} results copied to clipboard!`);
                          }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white hover:bg-gray-100 p-1 rounded shadow text-gray-600 hover:text-gray-800"
                          title={`Copy ${stepId} results`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <pre className="text-xs font-mono whitespace-pre-wrap pr-8">
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Duration: {formatDuration(selectedExecution.startTime, selectedExecution.endTime)} | 
                Steps: {Object.keys(selectedExecution.stepResults).length} | 
                Status: {selectedExecution.status}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(selectedExecution.stepResults, null, 2));
                    alert('Results copied to clipboard!');
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setShowFullResults(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
