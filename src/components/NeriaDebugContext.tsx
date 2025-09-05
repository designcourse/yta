'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';

interface DebugContextData {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  contextPercentage: number;
  inputTokens: number;
  maxTokens: number;
  model: string;
  channelMeta: any;
  memoryProfile: any;
  statsSummary: string | null;
  aboutText: string;
  recentTitles: string[];
  strategyPlan: string | null;
  research?: { content: string; sources?: string[] };
}

interface NeriaDebugContextProps {
  threadId?: string;
  channelId?: string;
  isVisible: boolean;
  onClose: () => void;
}

export default function NeriaDebugContext({ threadId, channelId, isVisible, onClose }: NeriaDebugContextProps) {
  const [debugData, setDebugData] = useState<DebugContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'context' | 'messages' | 'raw'>('context');

  const fetchDebugContext = useCallback(async () => {
    if (!threadId || !channelId) return;
    
    console.log('Fetching debug context for:', { threadId, channelId });
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/neria/debug-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, channelId })
      });
      
      console.log('Debug context response:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Debug context error:', errorData);
        throw new Error(`Failed to fetch debug context: ${response.status} - ${errorData.error || response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Debug context data received:', data);
      setDebugData(data);
    } catch (err) {
      console.error('Debug context fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [threadId, channelId]);

  useEffect(() => {
    if (isVisible && threadId && channelId) {
      fetchDebugContext();
    }
  }, [isVisible, threadId, channelId, fetchDebugContext]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Neria Debug Context</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(['context', 'messages', 'raw'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'context' ? 'Context Components' : tab === 'messages' ? 'Message History' : 'Raw Data'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">Loading debug context...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-500">Error: {error}</div>
            </div>
          ) : !debugData ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">No debug data available</div>
            </div>
          ) : (
            <div className="h-full overflow-auto p-4">
              {activeTab === 'context' && (
                <div className="space-y-6">
                  {/* Context Overview */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-gray-900 mb-2">Context Overview</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Model:</span> {debugData.model}
                      </div>
                      <div>
                        <span className="font-medium">Context Usage:</span> {debugData.contextPercentage}%
                      </div>
                      <div>
                        <span className="font-medium">Input Tokens:</span> {debugData.inputTokens.toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">Max Tokens:</span> {debugData.maxTokens.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Channel Metadata */}
                  {debugData.channelMeta && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Channel Metadata</h3>
                      <div className="bg-gray-100 p-3 rounded text-sm font-mono">
                        <div><strong>Title:</strong> {debugData.channelMeta.title || '(untitled)'}</div>
                        <div><strong>YouTube ID:</strong> {debugData.channelMeta.externalId || 'unknown'}</div>
                      </div>
                    </div>
                  )}

                  {/* Memory Profile */}
                  {debugData.memoryProfile && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Memory Profile</h3>
                      <div className="bg-gray-100 p-3 rounded text-sm space-y-2">
                        {debugData.memoryProfile.goals && (
                          <div><strong>Goals:</strong> {debugData.memoryProfile.goals}</div>
                        )}
                        {debugData.memoryProfile.preferences && (
                          <div><strong>Preferences:</strong> {debugData.memoryProfile.preferences}</div>
                        )}
                        {debugData.memoryProfile.constraints && (
                          <div><strong>Constraints:</strong> {debugData.memoryProfile.constraints}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stats Summary */}
                  {debugData.statsSummary && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Latest Stats</h3>
                      <div className="bg-gray-100 p-3 rounded text-sm font-mono whitespace-pre-wrap">
                        {debugData.statsSummary}
                      </div>
                    </div>
                  )}

                  {/* About Text */}
                  {debugData.aboutText && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">About Text</h3>
                      <div className="bg-gray-100 p-3 rounded text-sm">
                        {debugData.aboutText}
                      </div>
                    </div>
                  )}

                  {/* Recent Titles */}
                  {debugData.recentTitles && debugData.recentTitles.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Recent Titles</h3>
                      <div className="bg-gray-100 p-3 rounded text-sm">
                        {debugData.recentTitles.join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Strategy Plan */}
                  {debugData.strategyPlan && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Current Strategy Plan</h3>
                      <div className="bg-gray-100 p-3 rounded text-sm font-mono whitespace-pre-wrap">
                        {debugData.strategyPlan}
                      </div>
                    </div>
                  )}

                  {/* Research */}
                  {debugData.research && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Real-time Research</h3>
                      <div className="bg-gray-100 p-3 rounded text-sm font-mono whitespace-pre-wrap">
                        {debugData.research.content}
                      </div>
                      {debugData.research.sources && debugData.research.sources.length > 0 && (
                        <div className="mt-2">
                          <h4 className="font-medium text-gray-700 mb-1">Sources:</h4>
                          <ul className="list-disc list-inside text-sm text-gray-600">
                            {debugData.research.sources.map((source, i) => (
                              <li key={i}>{source}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'messages' && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Message History</h3>
                  {debugData.messages.map((message, index) => (
                    <div key={index} className={`p-3 rounded-lg ${
                      message.role === 'system' ? 'bg-yellow-50 border border-yellow-200' :
                      message.role === 'user' ? 'bg-blue-50 border border-blue-200' :
                      'bg-green-50 border border-green-200'
                    }`}>
                      <div className="font-semibold text-sm mb-1 capitalize">
                        {message.role}
                      </div>
                      <div className="text-sm whitespace-pre-wrap font-mono">
                        {message.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'raw' && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Raw Context Payload (sent to model)</h3>
                  <pre className="bg-gray-100 p-4 rounded text-xs font-mono overflow-auto whitespace-pre-wrap break-words">
                    {
                      // Replace escaped newlines (\n) with real new lines for readability
                      JSON.stringify({ messages: debugData.messages }, null, 2).replace(/\\n/g, '\n')
                    }
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            {debugData && `Thread ID: ${threadId} | Channel ID: ${channelId}`}
          </div>
          <button
            onClick={fetchDebugContext}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {loading ? 'Refreshing...' : 'Refresh Context'}
          </button>
        </div>
      </div>
    </div>
  );
}
