'use client';

import { useState } from 'react';
import { discoveredEndpoints, getCategories, getEndpointsByCategory, APIEndpoint } from '@/utils/neria-workflows/api-discovery';

interface NodePaletteProps {
  onAddNode: (endpoint: APIEndpoint) => void;
}

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('youtube');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = getCategories();
  const filteredEndpoints = getEndpointsByCategory(selectedCategory).filter(endpoint =>
    endpoint.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    endpoint.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'youtube':
        return '🎥';
      case 'openai':
        return '🤖';
      case 'database':
        return '💾';
      case 'external':
        return '🔗';
      default:
        return '⚙️';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'youtube': return 'border-red-300 bg-red-50 hover:bg-red-100';
      case 'openai': return 'border-green-300 bg-green-50 hover:bg-green-100';
      case 'database': return 'border-blue-300 bg-blue-50 hover:bg-blue-100';
      case 'external': return 'border-purple-300 bg-purple-50 hover:bg-purple-100';
      default: return 'border-gray-300 bg-gray-50 hover:bg-gray-100';
    }
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Node Palette</h2>
        
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50">
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${selectedCategory === category 
                ? 'border-blue-500 text-blue-600 bg-white' 
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }
            `}
          >
            <span className="text-lg">{getCategoryIcon(category)}</span>
            <span className="capitalize">{category}</span>
          </button>
        ))}
      </div>

      {/* Nodes List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredEndpoints.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-1.009-5.824-2.562M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm">No nodes found</p>
            <p className="text-xs text-gray-400 mt-1">Try searching or select a different category</p>
          </div>
        ) : (
          filteredEndpoints.map(endpoint => (
            <div
              key={endpoint.id}
              className={`
                p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md
                ${getCategoryColor(endpoint.category)}
              `}
              onClick={() => onAddNode(endpoint)}
              title={`Click to add ${endpoint.name} node`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-sm text-gray-900 line-clamp-1">
                  {endpoint.name}
                </h3>
                <span className="text-xs px-2 py-1 bg-white rounded-full text-gray-600 ml-2">
                  {endpoint.method}
                </span>
              </div>
              
              <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                {endpoint.description}
              </p>
              
              <div className="flex justify-between text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-500">
                    {endpoint.inputs.length} input{endpoint.inputs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-gray-500">
                    {endpoint.outputs.length} output{endpoint.outputs.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 text-center">
          <p>{discoveredEndpoints.length} total endpoints available</p>
          <p className="mt-1">Drag nodes onto the canvas to build workflows</p>
        </div>
      </div>
    </div>
  );
}
