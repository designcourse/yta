'use client';

import { useState, useRef, useCallback } from 'react';
import WorkflowNode, { WorkflowNodeData } from './WorkflowNode';
import { APIEndpoint } from '@/utils/neria-workflows/api-discovery';

interface WorkflowCanvasProps {
  nodes: WorkflowNodeData[];
  onNodesChange: (nodes: WorkflowNodeData[]) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

export default function WorkflowCanvas({ 
  nodes, 
  onNodesChange, 
  selectedNodeId, 
  onSelectNode 
}: WorkflowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSource, setConnectionSource] = useState<{ nodeId: string; isOutput: boolean } | null>(null);
  // Ref to ensure click handlers immediately see the latest connection state
  const connectionStateRef = useRef<{ isConnecting: boolean; source: { nodeId: string; isOutput: boolean } | null }>({
    isConnecting: false,
    source: null,
  });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      // Deselect nodes when clicking on empty canvas
      onSelectNode(null);
      
      // Start panning
      setIsPanning(true);
      setPanStart({
        x: e.clientX - canvasOffset.x,
        y: e.clientY - canvasOffset.y
      });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    // Update mouse position for connection line
    setMousePosition({ x: e.clientX, y: e.clientY });
    
    if (isPanning) {
      setCanvasOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    
    // Cancel connection if clicking on empty canvas
    if (isConnecting) {
      setIsConnecting(false);
      setConnectionSource(null);
    }
  };

  const handleNodeSelect = (nodeId: string) => {
    onSelectNode(nodeId);
  };

  const handleNodeDelete = (nodeId: string) => {
    const updatedNodes = nodes.filter(node => node.id !== nodeId);
    onNodesChange(updatedNodes);
    if (selectedNodeId === nodeId) {
      onSelectNode(null);
    }
  };

  const handleNodeUpdate = (nodeId: string, updates: Partial<WorkflowNodeData>) => {
    const updatedNodes = nodes.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    );
    onNodesChange(updatedNodes);
  };

  const handleNodeConnect = useCallback((fromNodeId: string, toNodeId: string) => {
    console.log(`[Canvas] ✅ CONNECTING ${fromNodeId} to ${toNodeId}`);
    
    // Update the from node to include the connection
    const updatedNodes = nodes.map(node => {
      if (node.id === fromNodeId) {
        const newConnections = [...new Set([...node.connections, toNodeId])]; // Avoid duplicates
        console.log(`[Canvas] Updated connections for ${fromNodeId}:`, newConnections);
        return {
          ...node,
          connections: newConnections
        };
      }
      return node;
    });
    
    console.log(`[Canvas] Total connections in workflow:`, 
      updatedNodes.reduce((total, node) => total + node.connections.length, 0)
    );
    
    onNodesChange(updatedNodes);
    
    // End connection mode immediately
    setIsConnecting(false);
    setConnectionSource(null);
    connectionStateRef.current = { isConnecting: false, source: null };
    
    console.log(`[Canvas] Connection mode ended`);
  }, [nodes, onNodesChange]);

  const handleStartConnection = useCallback((nodeId: string, isOutput: boolean) => {
    console.log(`[Canvas] Starting connection from ${nodeId}, isOutput: ${isOutput}`);
    setIsConnecting(true);
    setConnectionSource({ nodeId, isOutput });
    // Update ref so subsequent clicks in the same frame see the latest value
    connectionStateRef.current = { isConnecting: true, source: { nodeId, isOutput } };
  }, []);

  const handleEndConnection = (nodeId: string, isOutput: boolean) => {
    setIsConnecting(false);
    setConnectionSource(null);
    connectionStateRef.current = { isConnecting: false, source: null };
  };

  // Draw connections between nodes
  const renderConnections = () => {
    return nodes.flatMap(node => 
      node.connections.map(targetId => {
        const targetNode = nodes.find(n => n.id === targetId);
        if (!targetNode) {
          return null;
        }

        const nodeWidth = 200;
        const connectionPointY = 95; // Match the actual connection point position
        
        const startX = node.position.x + nodeWidth; // Output point (right side)
        const startY = node.position.y + connectionPointY;
        const endX = targetNode.position.x; // Input point (left side)
        const endY = targetNode.position.y + connectionPointY;

        // Create curved path
        const controlX1 = startX + 100;
        const controlY1 = startY;
        const controlX2 = endX - 100;
        const controlY2 = endY;

        return (
          <svg
            key={`${node.id}-${targetId}`}
            className="absolute top-0 left-0 pointer-events-none z-30"
            style={{ 
              width: '100%', 
              height: '100%',
              transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`
            }}
          >
            <defs>
              <marker
                id={`arrowhead-${node.id}-${targetId}`}
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#3B82F6"
                />
              </marker>
            </defs>
            
            {/* Curved connection line */}
            <path
              d={`M ${startX} ${startY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${endX} ${endY}`}
              stroke="#3B82F6"
              strokeWidth="3"
              fill="none"
              markerEnd={`url(#arrowhead-${node.id}-${targetId})`}
              className="drop-shadow-sm"
            />
            
            {/* Debug: Also draw a simple straight line to ensure something shows */}
            <line
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke="#EF4444"
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.5"
            />
          </svg>
        );
      })
    );
  };

  return (
    <div className="flex-1 relative overflow-hidden bg-gray-50">
      {/* Grid Background */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle, #e5e7eb 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: `${canvasOffset.x % 20}px ${canvasOffset.y % 20}px`
        }}
      />

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Connections */}
        {renderConnections()}
        
        {/* Active Connection Line */}
        {isConnecting && connectionSource && (
          <svg
            className="absolute top-0 left-0 pointer-events-none z-40"
            style={{ width: '100%', height: '100%' }}
          >
            {(() => {
              const sourceNode = nodes.find(n => n.id === connectionSource.nodeId);
              if (!sourceNode) return null;
              
              const canvasRect = canvasRef.current?.getBoundingClientRect();
              if (!canvasRect) return null;
              
              // Calculate connection point positions more precisely
              const nodeWidth = 200;
              const nodeHeight = 120;
              const connectionPointY = 95; // Position of connection points within the node
              
              const startX = sourceNode.position.x + canvasOffset.x + (connectionSource.isOutput ? nodeWidth : 0);
              const startY = sourceNode.position.y + canvasOffset.y + connectionPointY;
              const endX = mousePosition.x - canvasRect.left;
              const endY = mousePosition.y - canvasRect.top;
              
              return (
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke="#3B82F6"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  className="drop-shadow-sm"
                />
              );
            })()}
          </svg>
        )}

        {/* Nodes */}
        <div
          style={{
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`
          }}
        >
          {nodes.map(node => (
            <WorkflowNode
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              onSelect={handleNodeSelect}
              onDelete={handleNodeDelete}
              onUpdate={handleNodeUpdate}
              onConnect={handleNodeConnect}
              onStartConnection={handleStartConnection}
              onEndConnection={handleEndConnection}
              isConnecting={isConnecting}
              connectionSource={connectionSource}
              connectionStateRef={connectionStateRef}
            />
          ))}
        </div>

        {/* Empty State */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
              </svg>
              <h3 className="text-lg font-medium mb-2">Start Building Your Workflow</h3>
              <p className="text-sm mb-4">Drag nodes from the palette to begin</p>
              <div className="text-xs text-gray-400">
                <p>• Click and drag to pan the canvas</p>
                <p>• Select nodes to configure them</p>
                <p>• Connect nodes to build data flows</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Connection Instructions */}
      {isConnecting && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <p className="text-sm font-medium">
            {connectionSource?.isOutput ? 
              'Click on a blue input circle to complete connection' : 
              'Click on a green output circle to complete connection'
            }
          </p>
          <p className="text-xs opacity-90 mt-1">Press Escape or click empty space to cancel</p>
        </div>
      )}

      {/* Canvas Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={() => setCanvasOffset({ x: 0, y: 0 })}
          className="px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-sm"
          title="Reset View"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        
        {isConnecting && (
          <button
            onClick={() => {
              setIsConnecting(false);
              setConnectionSource(null);
            }}
            className="px-3 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 text-sm"
          >
            Cancel Connection
          </button>
        )}
        
        <div className={`px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-xs ${
          isConnecting ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-white text-gray-600'
        }`}>
          {nodes.length} node{nodes.length !== 1 ? 's' : ''}
          {isConnecting && connectionSource && (
            <span> • Connecting from {connectionSource.isOutput ? 'output' : 'input'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
