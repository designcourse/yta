'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useNeria } from './NeriaContext';

const NeriaContainer: React.FC = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const { isFullscreen, setIsFullscreen } = useNeria();
  
  // Position and size state for when in fullscreen/absolute mode
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 460, height: 800 });
  const [hasBeenPositioned, setHasBeenPositioned] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState('');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse event handlers for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isFullscreen) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  }, [isFullscreen, position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && isFullscreen) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    } else if (isResizing && isFullscreen) {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = position.x;
      let newY = position.y;

      if (resizeDirection.includes('right')) {
        newWidth = Math.max(380, resizeStart.width + deltaX);
      }
      if (resizeDirection.includes('left')) {
        newWidth = Math.max(380, resizeStart.width - deltaX);
        newX = resizeStart.posX + (resizeStart.width - newWidth);
      }
      if (resizeDirection.includes('bottom')) {
        newHeight = Math.max(200, resizeStart.height + deltaY);
      }
      if (resizeDirection.includes('top')) {
        newHeight = Math.max(200, resizeStart.height - deltaY);
        newY = resizeStart.posY + (resizeStart.height - newHeight);
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    }
  }, [isDragging, isResizing, isFullscreen, dragStart, resizeStart, position, resizeDirection]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeDirection('');
  }, []);

  // Mouse event handlers for resizing
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, direction: string) => {
    if (!isFullscreen) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: position.x,
      posY: position.y
    });
  }, [isFullscreen, size, position]);

  // Position the container correctly when first detached
  React.useEffect(() => {
    if (isFullscreen && !hasBeenPositioned) {
      const rightOffset = 20; // 20px from right edge
      const topOffset = 100; // 100px from top
      const newX = window.innerWidth - size.width - rightOffset;
      const newY = topOffset;
      
      setPosition({ x: newX, y: newY });
      setHasBeenPositioned(true);
    } else if (!isFullscreen) {
      // Reset positioning flag when going back to fixed mode
      setHasBeenPositioned(false);
    }
  }, [isFullscreen, hasBeenPositioned, size.width]);

  // Attach global mouse events
  React.useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div 
      ref={containerRef}
      className={`${isFullscreen ? 'absolute' : 'fixed'} ${isFullscreen ? 'p-0' : 'p-4'} ${isFullscreen ? '' : 'right-0 top-0'} ${isFullscreen ? '' : 'h-screen'} ${isFullscreen ? 'z-[9999]' : 'z-50'}`} 
      style={isFullscreen ? {
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        minWidth: '380px'
      } : {
        minWidth: '380px', 
        width: 'min(460px, 25vw)',
        right: 0,
        top: 0,
        height: '100vh'
      }}
    >
      {/* Resize Handles - Only visible in fullscreen mode */}
      {isFullscreen && (
        <>
          {/* Top resize handle */}
          <div 
            className="absolute top-0 left-0 w-full cursor-n-resize z-10"
            style={{ height: '10px' }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'top')}
          />
          {/* Bottom resize handle */}
          <div 
            className="absolute bottom-0 left-0 w-full cursor-s-resize z-10"
            style={{ height: '10px' }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
          />
          {/* Left resize handle */}
          <div 
            className="absolute top-0 left-0 h-full cursor-w-resize z-10"
            style={{ width: '10px' }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
          />
          {/* Right resize handle */}
          <div 
            className="absolute top-0 right-0 h-full cursor-e-resize z-10"
            style={{ width: '10px' }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
          />
          {/* Corner resize handles */}
          <div 
            className="absolute top-0 left-0 cursor-nw-resize z-10"
            style={{ width: '10px', height: '10px' }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'topleft')}
          />
          <div 
            className="absolute top-0 right-0 cursor-ne-resize z-10"
            style={{ width: '10px', height: '10px' }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'topright')}
          />
          <div 
            className="absolute bottom-0 left-0 cursor-sw-resize z-10"
            style={{ width: '10px', height: '10px' }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'bottomleft')}
          />
          <div 
            className="absolute bottom-0 right-0 cursor-se-resize z-10"
            style={{ width: '10px', height: '10px' }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'bottomright')}
          />
        </>
      )}

      {/* Main Neria Container - Dark Theme */}
      <div className={`h-full flex flex-col rounded-md ${isFullscreen ? 'p-4' : ''}`} style={{ backgroundColor: '#313344' }}>
        
        {/* Neria Chat Area */}
        <div className="flex-1" style={{ height: 'calc(100% - 120px)' }}>
          <div className="px-6 py-8 h-full flex flex-col">
            
            {/* Neria Header */}
            <div 
              className={`flex items-center justify-between mb-8 ${isFullscreen ? 'cursor-move' : ''}`} 
              style={{ height: '90px' }}
              onMouseDown={handleMouseDown}
            >
              {/* Minimize/Back Button */}
              <button 
                onClick={() => setIsMinimized(!isMinimized)}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-6 h-6 flex items-center justify-center text-white hover:text-gray-300 transition-colors"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              
              {/* Neria Avatar - Glassmorphic style */}
              <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-400/30 to-blue-400/30 backdrop-blur-sm rounded-full"></div>
                <div className="w-16 h-16 bg-gradient-to-br from-purple-300 to-blue-300 rounded-full flex items-center justify-center relative z-10">
                  <span className="text-white font-medium text-lg">N</span>
                </div>
              </div>
              
              {/* Detach Window Button */}
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-4 h-4 flex items-center justify-center text-white hover:text-gray-300 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8.5 2.5H13.5V7.5M13.5 2.5L8.5 7.5M6.5 2.5H2.5V13.5H13.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Neria Title */}
            {!isMinimized && (
              <div className="mb-6">
                <h2 className="text-white text-2xl font-medium">Neria</h2>
              </div>
            )}

            {/* Message Container */}
            {!isMinimized && (
              <div className="flex-1 overflow-y-auto space-y-4">
                
                {/* Neria Message */}
                <div className="text-white space-y-4">
                  <p className="text-base leading-relaxed opacity-80">
                    Let's plan your next video. I've suggested a few different topics.
                  </p>
                  <p className="text-base leading-relaxed opacity-80">
                    Choose one to get started, or provide me with other ideas and I can generate some more for you...
                  </p>
                </div>

                {/* User Message Component */}
                <div 
                  className="px-4 py-3 text-white text-sm leading-relaxed"
                  style={{ 
                    backgroundColor: '#3086ff',
                    borderRadius: '12px'
                  }}
                >
                  Hm, I don't like any of these, could you come up with titles that have more to do with AI workflows in UI/UX design?
                </div>

              </div>
            )}
          </div>
        </div>

        {/* User Chat Input Area */}
        {!isMinimized && (
          <div 
            className="px-6 py-4 flex items-center space-x-3 rounded-bl-md rounded-br-md" 
            style={{ 
              height: '120px',
              backgroundColor: '#404258'
            }}
          >
            
            {/* Attach Files Button */}
            <button className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M21.44 11.05L12.25 20.24C11.1242 21.3658 9.59718 21.9983 8.005 21.9983C6.41282 21.9983 4.88583 21.3658 3.76 20.24C2.63416 19.1142 2.00166 17.5872 2.00166 15.995C2.00166 14.4028 2.63416 12.8758 3.76 11.75L12.95 2.56C13.7006 1.80945 14.7186 1.38845 15.78 1.38845C16.8414 1.38845 17.8594 1.80945 18.61 2.56C19.3606 3.31055 19.7816 4.32855 19.7816 5.39C19.7816 6.45145 19.3606 7.46945 18.61 8.22L9.41 17.41C9.03463 17.7854 8.52583 17.9972 8 17.9972C7.47417 17.9972 6.96537 17.7854 6.59 17.41C6.21463 17.0346 6.00284 16.5258 6.00284 16C6.00284 15.4742 6.21463 14.9654 6.59 14.59L15.07 6.13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            
            {/* Chat Text Field */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Ask Neria about your YouTube strategy..."
                className="w-full px-4 py-3 bg-transparent border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                style={{ borderRadius: '12px' }}
                disabled
              />
            </div>
            
            {/* Send Button */}
            <button 
              className="w-10 h-10 text-white flex items-center justify-center transition-colors hover:bg-blue-600"
              style={{ 
                backgroundColor: '#3086ff',
                borderRadius: '12px'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 19V5M5 12L12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NeriaContainer;
