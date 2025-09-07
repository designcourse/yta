'use client';

import { useState } from 'react';
import { APIEndpoint } from '@/utils/neria-workflows/api-discovery';

export interface WorkflowNodeData {
  id: string;
  type: 'api' | 'transform' | 'condition' | 'parallel';
  endpoint?: APIEndpoint;
  config: Record<string, any>;
  inputs: Record<string, any>;
  position: { x: number; y: number };
  connections: string[]; // IDs of connected nodes
}

interface WorkflowNodeProps {
  node: WorkflowNodeData;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNodeData>) => void;
  onConnect: (fromNodeId: string, toNodeId: string) => void;
  onStartConnection?: (nodeId: string, isOutput: boolean) => void;
  onEndConnection?: (nodeId: string, isOutput: boolean) => void;
  isConnecting?: boolean;
  connectionSource?: { nodeId: string; isOutput: boolean } | null;
  connectionStateRef?: React.MutableRefObject<{ isConnecting: boolean; source: { nodeId: string; isOutput: boolean } | null }>;
}

export default function WorkflowNode({ 
  node, 
  isSelected, 
  onSelect, 
  onDelete, 
  onUpdate,
  onConnect,
  onStartConnection,
  onEndConnection,
  isConnecting = false,
  connectionSource,
  connectionStateRef
}: WorkflowNodeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'youtube': return 'bg-red-100 border-red-300 text-red-800';
      case 'openai': return 'bg-green-100 border-green-300 text-green-800';
      case 'database': return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'external': return 'bg-purple-100 border-purple-300 text-purple-800';
      default: return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getNodeIcon = (category?: string) => {
    switch (category) {
      case 'youtube':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case 'openai':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 19.7a6.0462 6.0462 0 0 0 8.9787-8.6789 5.9847 5.9847 0 0 0 .0433-.2"/>
          </svg>
        );
      case 'database':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 3.79 5 6v12c0 2.21 3.13 4 7 4s7-1.79 7-4V6c0-2.21-3.13-4-7-4zm0 2c3.31 0 5 1.22 5 2s-1.69 2-5 2-5-1.22-5-2 1.69-2 5-2zm0 16c-3.31 0-5-1.22-5-2v-2.92C8.16 15.67 9.98 16 12 16s3.84-.33 5-.92V18c0 .78-1.69 2-5 2z"/>
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        );
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click only
      setIsDragging(true);
      setDragStart({
        x: e.clientX - node.position.x,
        y: e.clientY - node.position.y
      });
      onSelect(node.id);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      onUpdate(node.id, {
        position: {
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        }
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      className={`
        absolute bg-white rounded-lg border-2 shadow-lg cursor-move select-none
        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${isDragging ? 'z-50' : 'z-10'}
        hover:shadow-xl transition-shadow
      `}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: '200px',
        minHeight: '120px'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Node Header */}
      <div className={`px-3 py-2 rounded-t-lg border-b ${getCategoryColor(node.endpoint?.category)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getNodeIcon(node.endpoint?.category)}
            <span className="font-medium text-sm truncate">
              {node.endpoint?.name || 'Unknown Node'}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            className="text-gray-400 hover:text-red-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Node Body */}
      <div className="p-3">
        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
          {node.endpoint?.description || 'No description'}
        </p>
        
        {/* Input/Output Indicators */}
        <div className="flex justify-between text-xs">
          <div>
            <span className="text-gray-500">In: </span>
            <span className="text-blue-600">
              {node.endpoint?.inputs.length || 0}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Out: </span>
            <span className="text-green-600">
              {node.endpoint?.outputs.length || 0}
            </span>
          </div>
        </div>

        {/* Connection Points */}
        <div className="flex justify-between mt-2">
          {/* Input Connection Point */}
          <div 
            className={`
              w-3 h-3 rounded-full -ml-6 mt-1 border-2 border-white shadow cursor-pointer hover:scale-125 transition-transform
              ${isConnecting && connectionSource?.isOutput ? 'bg-blue-400 animate-pulse' : 'bg-blue-500'}
              ${isConnecting && !connectionSource?.isOutput && connectionSource?.nodeId !== node.id ? 'bg-gray-400' : ''}
            `}
            onClick={(e) => {
              e.stopPropagation();
              const live = connectionStateRef?.current || { isConnecting, source: connectionSource || null };
              const liveIsConnecting = live.isConnecting;
              const liveSource = live.source;
              console.log('Input clicked:', { nodeId: node.id, liveIsConnecting, liveSource });
              
              if (liveIsConnecting && liveSource?.isOutput && liveSource.nodeId !== node.id) {
                // Complete connection: output -> input
                console.log('✅ Completing connection:', liveSource.nodeId, '->', node.id);
                onConnect(liveSource.nodeId, node.id);
                if (onEndConnection) onEndConnection(node.id, false);
                return; // Exit early to prevent further processing
              } else if (!isConnecting) {
                // Start connection from input
                console.log('🔵 Starting connection from input:', node.id);
                if (onStartConnection) onStartConnection(node.id, false);
              } else {
                console.log('❌ Connection not completed - invalid state:', {
                  isConnecting: liveIsConnecting,
                  sourceIsOutput: liveSource?.isOutput,
                  sourceNode: liveSource?.nodeId,
                  targetNode: node.id,
                  sameNode: liveSource?.nodeId === node.id
                });
              }
            }}
            title="Input connection point"
          />
          
          {/* Output Connection Point */}
          <div 
            className={`
              w-3 h-3 rounded-full -mr-6 mt-1 border-2 border-white shadow cursor-pointer hover:scale-125 transition-transform
              ${isConnecting && !connectionSource?.isOutput ? 'bg-green-400 animate-pulse' : 'bg-green-500'}
              ${isConnecting && connectionSource?.isOutput && connectionSource?.nodeId !== node.id ? 'bg-gray-400' : ''}
            `}
            onClick={(e) => {
              e.stopPropagation();
              const live = connectionStateRef?.current || { isConnecting, source: connectionSource || null };
              const liveIsConnecting = live.isConnecting;
              const liveSource = live.source;
              console.log('Output clicked:', { nodeId: node.id, liveIsConnecting, liveSource });
              
              if (liveIsConnecting && !liveSource?.isOutput && liveSource?.nodeId !== node.id) {
                // Complete connection: input -> output (reverse)
                console.log('✅ Completing reverse connection:', liveSource?.nodeId, '<-', node.id);
                onConnect(node.id, liveSource!.nodeId);
                if (onEndConnection) onEndConnection(node.id, true);
                return; // Exit early to prevent further processing
              } else if (!isConnecting) {
                // Start connection from output
                console.log('🟢 Starting connection from output:', node.id);
                if (onStartConnection) onStartConnection(node.id, true);
              } else {
                console.log('❌ Output connection not completed - invalid state:', {
                  isConnecting: liveIsConnecting,
                  sourceIsOutput: liveSource?.isOutput,
                  sourceNode: liveSource?.nodeId,
                  targetNode: node.id,
                  sameNode: liveSource?.nodeId === node.id
                });
              }
            }}
            title="Output connection point"
          />
        </div>
      </div>

      {/* Node ID for debugging */}
      <div className="absolute -top-6 left-0 text-xs text-gray-400 font-mono">
        {node.id.slice(-4)}
      </div>
    </div>
  );
}
