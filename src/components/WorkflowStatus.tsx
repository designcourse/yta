'use client';

import { useEffect, useState } from 'react';

type WorkflowStatus = {
  system: string;
  version: string;
  status: 'operational' | 'error';
  workflows?: {
    available: number;
    loaded: string[];
  };
  executors?: {
    available: string[];
    status: string;
  };
  error?: string;
  timestamp: string;
};

export default function WorkflowStatus() {
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/neria-workflows/status');
        const data = await res.json();
        setStatus(data);
      } catch (error) {
        console.error('Failed to fetch workflow status:', error);
        setStatus({
          system: 'Neria Workflow Engine',
          version: '1.0.0',
          status: 'error',
          error: 'Failed to connect',
          timestamp: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Workflow Engine</h3>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!status) return null;

  const statusColor = status.status === 'operational' ? 'text-green-600' : 'text-red-600';
  const statusBg = status.status === 'operational' ? 'bg-green-50' : 'bg-red-50';

  return (
    <div className={`p-4 rounded-lg ${statusBg}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-900">{status.system}</h3>
        <span className={`text-xs font-medium ${statusColor}`}>
          {status.status.toUpperCase()}
        </span>
      </div>
      
      <div className="text-xs text-gray-600 space-y-1">
        <p>Version: {status.version}</p>
        
        {status.workflows && (
          <p>Workflows: {status.workflows.available} available</p>
        )}
        
        {status.executors && (
          <p>Executors: {status.executors.available.length} types</p>
        )}
        
        {status.error && (
          <p className="text-red-600">Error: {status.error}</p>
        )}
        
        <p className="opacity-75">
          Last checked: {new Date(status.timestamp).toLocaleTimeString()}
        </p>
      </div>
      
      {status.workflows?.loaded && status.workflows.loaded.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
            Available Workflows ({status.workflows.loaded.length})
          </summary>
          <ul className="mt-1 text-xs text-gray-600 ml-4">
            {status.workflows.loaded.map(workflow => (
              <li key={workflow} className="list-disc">
                {workflow}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
