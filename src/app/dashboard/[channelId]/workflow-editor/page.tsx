'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import NodePalette from '@/components/WorkflowEditor/NodePalette';
import WorkflowCanvas from '@/components/WorkflowEditor/WorkflowCanvas';
import { WorkflowNodeData } from '@/components/WorkflowEditor/WorkflowNode';
import { APIEndpoint, getEndpointById } from '@/utils/neria-workflows/api-discovery';
import { WorkflowCompiler } from '@/utils/neria-workflows/workflow-compiler';
import type { Workflow } from '@/utils/neria-workflows/types';

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const channelId = params.channelId as string;

  const [nodes, setNodes] = useState<WorkflowNodeData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [isSaving, setIsSaving] = useState(false);
  const [workflows, setWorkflows] = useState<Array<{ id: string; key: string; name: string }>>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const generateNodeId = () => {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleAddNode = useCallback((endpoint: APIEndpoint) => {
    const newNode: WorkflowNodeData = {
      id: generateNodeId(),
      type: 'api',
      endpoint,
      config: {},
      inputs: {},
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100
      },
      connections: []
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  }, []);

  const handleNodesChange = useCallback((updatedNodes: WorkflowNodeData[]) => {
    setNodes(updatedNodes);
  }, []);

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const setSelectedNodeInput = useCallback((key: string, value: any, options?: { asConfig?: boolean }) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== selectedNodeId) return n;
      if (options?.asConfig) {
        return { ...n, config: { ...n.config, [key]: value } };
      }
      return { ...n, inputs: { ...n.inputs, [key]: value } };
    }));
  }, [selectedNodeId]);

  const setSelectedNodeConfig = useCallback((key: string, value: any) => {
    setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, config: { ...n.config, [key]: value } } : n));
  }, [selectedNodeId]);

  const generateWorkflowCode = () => {
    const compiler = new WorkflowCompiler();
    return compiler.compile(nodes, workflowName, 'Workflow created with visual editor');
  };

  const fetchWorkflows = useCallback(async () => {
    try {
      setIsLoadingList(true);
      const res = await fetch('/api/neria-workflows/workflows', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load workflows');
      const data = await res.json();
      setWorkflows((data.workflows || []).map((w: any) => ({ id: w.id, key: w.key, name: w.name })));
    } catch (e) {
      console.error('Load workflows failed', e);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const loadWorkflow = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/neria-workflows/workflows/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch workflow');
      const { workflow } = await res.json();
      setSelectedWorkflowId(workflow.id);
      setWorkflowName(workflow.name || 'Untitled Workflow');
      const visualNodes = workflow.visual?.nodes || [];
      if (Array.isArray(visualNodes) && visualNodes.length > 0) {
        setNodes(visualNodes);
      } else if (workflow.definition) {
        const built = buildNodesFromDefinition(workflow.definition as Workflow);
        setNodes(built);
      }
    } catch (e) {
      console.error('Load workflow error', e);
    }
  }, []);

  function buildNodesFromDefinition(def: Workflow): WorkflowNodeData[] {
    const nodesById = new Map<string, WorkflowNodeData>();
    const reverseYouTubeMap: Record<string, string> = {
      channels: 'youtube-channels',
      'analytics-reports': 'youtube-analytics',
      videos: 'youtube-videos',
      search: 'youtube-search',
    };

    // Create nodes
    def.steps.forEach((step, index) => {
      let endpoint: APIEndpoint | undefined;
      if (step.type === 'youtube-api') {
        const visualId = reverseYouTubeMap[(step.config as any)?.endpoint] || 'youtube-channels';
        endpoint = getEndpointById(visualId);
      } else if (step.type === 'openai') {
        // Choose analysis if analysisType expected; otherwise chat
        const visualId = (step.inputs as any)?.analysisType ? 'openai-analysis' : 'openai-chat';
        endpoint = getEndpointById(visualId);
      } else if (step.type === 'transform' || step.type === 'parallel') {
        endpoint = getEndpointById('transform-data');
      }

      const node: WorkflowNodeData = {
        id: step.id,
        type: 'api',
        endpoint,
        config: (step.config as any) || {},
        inputs: (step.inputs as any) || {},
        position: {
          x: 120 + (index % 3) * 260,
          y: 120 + Math.floor(index / 3) * 160,
        },
        connections: [],
      };
      nodesById.set(step.id, node);
    });

    // Create connections (dependency -> current)
    def.steps.forEach(step => {
      const deps = step.dependencies || [];
      deps.forEach(depId => {
        const source = nodesById.get(depId);
        if (source && !source.connections.includes(step.id)) {
          source.connections.push(step.id);
        }
      });
    });

    return Array.from(nodesById.values());
  }

  const handleSaveWorkflow = async () => {
    if (nodes.length === 0) {
      alert('Add some nodes to your workflow before saving!');
      return;
    }

    setIsSaving(true);
    try {
      const definition = generateWorkflowCode();
      const key = definition.id;
      const payload = {
        id: selectedWorkflowId || undefined,
        key,
        name: workflowName,
        description: definition.description,
        version: definition.version,
        definition,
        visual: { nodes },
      };
      const res = await fetch(selectedWorkflowId ? `/api/neria-workflows/workflows/${selectedWorkflowId}` : '/api/neria-workflows/workflows', {
        method: selectedWorkflowId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Save failed');
      }
      const { workflow } = await res.json();
      setSelectedWorkflowId(workflow.id);
      await fetchWorkflows();
      alert('Workflow saved');
    } catch (error) {
      console.error('Error saving workflow:', error);
      alert(`Error saving workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCanvas = () => {
    if (nodes.length > 0 && confirm('Are you sure you want to clear the canvas? This cannot be undone.')) {
      setNodes([]);
      setSelectedNodeId(null);
    }
  };

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            
            <div>
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="text-xl font-semibold bg-transparent border-none outline-none focus:bg-gray-50 px-2 py-1 rounded"
                placeholder="Workflow Name"
              />
              <p className="text-sm text-gray-600">Visual Workflow Editor</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Load</label>
              <select
                className="px-2 py-1 border rounded"
                disabled={isLoadingList}
                value={selectedWorkflowId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  loadWorkflow(val);
                }}
              >
                <option value="">Select...</option>
                {workflows.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <button
                onClick={() => { setSelectedWorkflowId(null); setWorkflowName('Untitled Workflow'); setNodes([]); }}
                className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
              >
                New
              </button>
              <button
                onClick={fetchWorkflows}
                className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
                title="Refresh list"
              >
                Refresh
              </button>
            </div>
            <button
              onClick={handleClearCanvas}
              disabled={nodes.length === 0}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 disabled:text-gray-400 transition-colors"
            >
              Clear
            </button>
            
            <button
              onClick={() => {
                const code = generateWorkflowCode();
                console.log('Preview:', code);
                alert('Workflow preview logged to console');
              }}
              disabled={nodes.length === 0}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
            >
              Preview
            </button>
            
            <button
              onClick={handleSaveWorkflow}
              disabled={isSaving || nodes.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Workflow'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette */}
        <NodePalette onAddNode={handleAddNode} />

        {/* Canvas */}
        <WorkflowCanvas
          nodes={nodes}
          onNodesChange={handleNodesChange}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />

        {/* Properties Panel */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Properties</h3>
          </div>

          <div className="flex-1 p-4">
            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Node Type
                  </label>
                  <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded">
                    {selectedNode.endpoint?.category || selectedNode.type}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name
                  </label>
                  <p className="text-sm text-gray-900 font-medium">
                    {selectedNode.endpoint?.name || 'Unknown Node'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <p className="text-sm text-gray-600">
                    {selectedNode.endpoint?.description || 'No description available'}
                  </p>
                </div>

                {selectedNode.endpoint && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Inputs ({selectedNode.endpoint.inputs.length})
                      </label>
                      <div className="space-y-3">
                        {selectedNode.endpoint.inputs.map(input => {
                          const isConfigForOpenAI = selectedNode.endpoint?.category === 'openai' && ['model','system','maxTokens'].includes(input.name);
                          const currentValue = (isConfigForOpenAI ? (selectedNode.config as any)[input.name] : (selectedNode.inputs as any)[input.name]) ?? input.default ?? '';
                          const isAutoBindable = input.name === 'channelId' || input.name === 'accessToken';
                          return (
                            <div key={input.name} className="text-sm p-2 bg-blue-50 rounded">
                              <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{input.name}</span>
                                  {input.required && (<span className="text-red-500 text-xs">Required</span>)}
                                </div>
                                <span className="text-blue-600">{input.type}</span>
                              </div>
                              <p className="text-gray-600 text-xs mb-2">{input.description}</p>
                              {isAutoBindable && (
                                <div className="flex items-center gap-2 mb-2">
                                  <button
                                    onClick={() => setSelectedNodeInput(input.name, `$input.${input.name}`)}
                                    className="px-2 py-0.5 text-xs border border-blue-200 rounded bg-white hover:bg-blue-50"
                                    title={input.name === 'channelId' ? 'Bind to current dashboard channel' : 'Bind to current session access token'}
                                  >
                                    {input.name === 'channelId' ? 'Use current channel' : 'Use session token'}
                                  </button>
                                  {typeof currentValue === 'string' && currentValue.startsWith('$input.') && (
                                    <span className="text-[11px] text-blue-700">Bound to {currentValue}</span>
                                  )}
                                </div>
                              )}
                              {input.type === 'number' ? (
                                <input
                                  type="number"
                                  value={currentValue}
                                  onChange={(e) => setSelectedNodeInput(input.name, Number(e.target.value), { asConfig: isConfigForOpenAI })}
                                  className="w-full px-2 py-1 border border-blue-200 rounded text-sm bg-white"
                                />
                              ) : input.name === 'prompt' ? (
                                <textarea
                                  rows={4}
                                  value={currentValue}
                                  onChange={(e) => setSelectedNodeInput(input.name, e.target.value)}
                                  placeholder="You can reference previous step outputs like: {{summary}} or {{steps.nodeId.response}}"
                                  className="w-full px-2 py-1 border border-blue-200 rounded text-sm bg-white"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={currentValue}
                                  onChange={(e) => setSelectedNodeInput(input.name, e.target.value, { asConfig: isConfigForOpenAI })}
                                  className="w-full px-2 py-1 border border-blue-200 rounded text-sm bg-white"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Outputs ({selectedNode.endpoint.outputs.length})
                      </label>
                      <div className="space-y-2">
                        {selectedNode.endpoint.outputs.map(output => (
                          <div key={output.name} className="text-sm p-2 bg-green-50 rounded">
                            <div className="flex justify-between">
                              <span className="font-medium">{output.name}</span>
                              <span className="text-green-600">{output.type}</span>
                            </div>
                            <p className="text-gray-600 text-xs mt-1">{output.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Position
                  </label>
                  <div className="text-xs text-gray-500 font-mono">
                    x: {Math.round(selectedNode.position.x)}, y: {Math.round(selectedNode.position.y)}
                  </div>
                </div>

                {selectedNode.endpoint?.category === 'openai' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bind prompt/system to system_prompts</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="promptKey (e.g. collection_greeting)"
                          value={(selectedNode.config as any)?.promptKey || ''}
                          onChange={(e) => setSelectedNodeConfig('promptKey', e.target.value)}
                          className="px-2 py-1 border rounded text-sm"
                        />
                        <input
                          type="text"
                          placeholder="systemKey (e.g. neria_chat_system)"
                          value={(selectedNode.config as any)?.systemKey || ''}
                          onChange={(e) => setSelectedNodeConfig('systemKey', e.target.value)}
                          className="px-2 py-1 border rounded text-sm"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">If set, these override empty prompt/system by loading from system_prompts.</p>
                    </div>
                    <div className="text-xs text-gray-500">
                      <p>
                        Tip: Use <code>{"{{var}}"}</code> to insert values, or reference previous steps like <code>$steps.NODE_ID.outputKey</code>.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p className="text-sm">Select a node to view properties</p>
                <p className="text-xs text-gray-400 mt-1">Click on any node in the canvas</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-gray-50 border-t border-gray-200 px-6 py-2 text-xs text-gray-600">
        <div className="flex justify-between items-center">
          <div>
            {nodes.length} nodes • {selectedNodeId ? '1 selected' : 'none selected'}
          </div>
          <div>
            Ready
          </div>
        </div>
      </div>
    </div>
  );
}
