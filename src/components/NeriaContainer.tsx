'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNeria } from './NeriaContext';
import ContextIndicator from './ContextIndicator';

// Simple function to convert markdown links to clickable HTML
function parseMarkdownLinks(text: string): React.ReactElement {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the link
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <a
        key={match.index}
        href={linkUrl}
        className="text-blue-300 hover:text-blue-200 underline"
        target={linkUrl.startsWith('http') ? '_blank' : '_self'}
        rel={linkUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {linkText}
      </a>
    );

    lastIndex = linkRegex.lastIndex;
  }

  // Add remaining text after the last link
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

const NeriaContainer: React.FC = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const { isFullscreen, setIsFullscreen, currentChannelId } = useNeria();
  
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
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<Array<{ id: string; role: string; content: string; created_at: string }>>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [contextPercentage, setContextPercentage] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Function to refresh messages
  const refreshMessages = useCallback(async () => {
    if (!threadId) return;
    try {
      const mRes = await fetch(`/api/neria/messages?threadId=${encodeURIComponent(threadId)}`);
      if (mRes.ok) {
        const m = await mRes.json();
        setMessages(m.messages || []);
        if (m.contextPercentage !== undefined) {
          setContextPercentage(m.contextPercentage);
        }
        console.log('Messages refreshed, total messages:', m.messages?.length || 0);
      }
    } catch (error) {
      console.error('Error refreshing messages:', error);
    }
  }, [threadId]);



  const loadThreadAndMessages = useCallback(async () => {
    console.log('Neria: loadThreadAndMessages called with channelId:', currentChannelId);
    if (!currentChannelId) {
      // Clear everything if no channel is selected
      console.log('Neria: No channelId, clearing state');
      setThreadId(undefined);
      setMessages([]);
      setContextPercentage(0);
      return;
    }
    
    try {
      setInitialLoading(true);
      
      // Clear existing state immediately when switching channels
      setMessages([]);
      setContextPercentage(0);
      
      // Try restore from localStorage first, but validate it belongs to this channel
      try {
        const restored = localStorage.getItem(`neria:lastThread:${currentChannelId}`);
        console.log('Neria: Checking localStorage for channel', currentChannelId, 'found:', restored);
        if (restored) {
          // Validate that this thread actually belongs to the current channel
          const validationRes = await fetch(`/api/neria/messages?threadId=${encodeURIComponent(restored)}&channelId=${encodeURIComponent(currentChannelId)}`);
          if (validationRes.ok) {
            const m = await validationRes.json();
            console.log('Neria: Loaded messages from localStorage thread:', m.messages?.length || 0, 'messages');
            setThreadId(restored);
            setMessages(m.messages || []);
            if (m.contextPercentage !== undefined) {
              setContextPercentage(m.contextPercentage);
            }
            setInitialLoading(false);
            return;
          } else {
            console.log('Neria: Failed to validate localStorage thread (status:', validationRes.status, '), clearing it');
            localStorage.removeItem(`neria:lastThread:${currentChannelId}`);
            // Clear the bad threadId from state as well
            setThreadId(undefined);
          }
        }
      } catch {}
      
      // Fetch most recent thread for this specific channel
      console.log('Neria: Fetching threads for channel:', currentChannelId);
      const tRes = await fetch(`/api/neria/threads?channelId=${encodeURIComponent(currentChannelId)}`);
      if (tRes.ok) {
        const data = await tRes.json();
        console.log('Neria: API returned threads:', data.threads?.length || 0, 'threads');
        const first = (data.threads || [])[0];
        if (first?.id) {
          setThreadId(first.id);
          const mRes = await fetch(`/api/neria/messages?threadId=${encodeURIComponent(first.id)}&channelId=${encodeURIComponent(currentChannelId)}`);
          if (mRes.ok) {
            const m = await mRes.json();
            console.log('Neria: Loaded messages from API thread:', m.messages?.length || 0, 'messages');
            setMessages(m.messages || []);
            if (m.contextPercentage !== undefined) {
              setContextPercentage(m.contextPercentage);
            }
          } else {
            setMessages([]);
          }
        } else {
          console.log('Neria: No threads found for channel, starting fresh');
          setThreadId(undefined);
          setMessages([]);
        }
      } else {
        // If API call fails, ensure we clear everything
        console.log('Neria: API call failed, clearing state');
        setThreadId(undefined);
        setMessages([]);
      }
    } catch (e) {
      console.error('Error loading thread and messages:', e);
      // Clear state on error to prevent showing wrong channel's data
      setThreadId(undefined);
      setMessages([]);
      setContextPercentage(0);
    } finally {
      setInitialLoading(false);
    }
  }, [currentChannelId]);

  useEffect(() => {
    loadThreadAndMessages();
  }, [loadThreadAndMessages]);

  // Track if component has mounted to avoid clearing on initial undefined state
  const hasMountedRef = useRef(false);
  
  // Additional effect to immediately clear chat when channel changes
  const prevChannelRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prevChannelId = prevChannelRef.current;
    
    // Skip initial mount when currentChannelId might be undefined
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevChannelRef.current = currentChannelId;
      return;
    }
    
    console.log('Neria: Channel changed from', prevChannelId, 'to:', currentChannelId);
    
    // Only clear state if we actually have a previous channel and it's different
    if (prevChannelId && prevChannelId !== currentChannelId) {
      // Clear messages immediately when channel changes to prevent showing wrong channel's data
      setMessages([]);
      setContextPercentage(0);
      setThreadId(undefined);
      
      // Clear any stale localStorage entries from previous channels
      try {
        localStorage.removeItem(`neria:lastThread:${prevChannelId}`);
        console.log('Neria: Cleared localStorage for previous channel:', prevChannelId);
      } catch {}
    }
    
    // Update the ref for next time
    prevChannelRef.current = currentChannelId;
  }, [currentChannelId]);

  // Listen for refresh messages event from planner redirect
  useEffect(() => {
    const handleRefreshMessages = () => {
      console.log('Received refresh-neria-messages event');
      refreshMessages();
    };

    window.addEventListener('refresh-neria-messages', handleRefreshMessages);
    return () => {
      window.removeEventListener('refresh-neria-messages', handleRefreshMessages);
    };
  }, [refreshMessages]);

  // Persist last thread in localStorage per channel so we can restore quickly on refresh
  useEffect(() => {
    if (threadId && currentChannelId) {
      try {
        localStorage.setItem(`neria:lastThread:${currentChannelId}`, threadId);
      } catch {}
    } else if (currentChannelId) {
      // If no threadId but we have a channel, clear any stale localStorage entry
      try {
        localStorage.removeItem(`neria:lastThread:${currentChannelId}`);
      } catch {}
    }
  }, [threadId, currentChannelId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const value = inputValue.trim();
    if (!value || !currentChannelId) return;
    
    // Optimistically add user message
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: 'user', content: value, created_at: new Date().toISOString() },
    ]);
    setInputValue("");
    
    const assistantId = `asst-${Date.now()}`;
    // Add empty assistant message that will be populated as we stream
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', created_at: new Date().toISOString() },
    ]);

    try {
      setSending(true);
      console.log('Sending Neria message:', {
        channelId: currentChannelId,
        threadId,
        message: value,
        currentUrl: window.location.pathname
      });
      
      const res = await fetch('/api/neria/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          channelId: currentChannelId, 
          threadId, 
          message: value,
          currentUrl: window.location.pathname
        })
      });
      
      if (!res.ok) {
        console.error('Chat failed');
        // Remove the empty assistant message on error
        setMessages((prev) => prev.filter(m => m.id !== assistantId));
        return;
      }

      if (!res.body) {
        console.error('No response body');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'init') {
                  if (data.threadId && !threadId) {
                    setThreadId(data.threadId);
                  }
                  if (data.contextPercentage !== undefined) {
                    setContextPercentage(data.contextPercentage);
                  }
                } else if (data.type === 'chunk' && data.content) {
                  // Update the assistant message with the new content
                  setMessages((prev) => prev.map(m => 
                    m.id === assistantId 
                      ? { ...m, content: m.content + data.content }
                      : m
                  ));
                } else if (data.type === 'done') {
                  // Streaming complete
                  break;
                } else if (data.type === 'message') {
                  // Handle regular message (including those with links)
                  const assistantId = `asst-message-${Date.now()}`;
                  setMessages((prev) => [
                    ...prev,
                    { id: assistantId, role: 'assistant', content: data.content, created_at: new Date().toISOString() },
                  ]);
                } else if (data.type === 'video_ideas_generating') {
                  // Video ideas generation started, dispatch a custom event
                  console.log('Dispatching video-ideas-generating event:', data.message);
                  const event = new CustomEvent('video-ideas-generating', { 
                    detail: { message: data.message }
                  });
                  window.dispatchEvent(event);
                } else if (data.type === 'contextual_message') {
                  // Add the contextual message as a new assistant message
                  const assistantId = `asst-contextual-${Date.now()}`;
                  setMessages((prev) => [
                    ...prev,
                    { id: assistantId, role: 'assistant', content: data.content, created_at: new Date().toISOString() },
                  ]);
                } else if (data.type === 'video_ideas_generated') {
                  // Video ideas were generated, dispatch a custom event
                  console.log('Dispatching video-ideas-generated event:', data.message);
                  const event = new CustomEvent('video-ideas-generated', { 
                    detail: { message: data.message }
                  });
                  window.dispatchEvent(event);
                } else if (data.type === 'error') {
                  console.error('Streaming error:', data.error);
                  break;
                }
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      console.error('Streaming error:', err);
      // Remove the empty assistant message on error
      setMessages((prev) => prev.filter(m => m.id !== assistantId));
    } finally {
      setSending(false);
    }
  }, [inputValue, currentChannelId, threadId]);

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
      <div className={`h-full flex flex-col rounded-md ${isFullscreen ? 'p-4' : ''} ${(sending || initialLoading) ? 'neria-loading-border' : ''}`} style={{ backgroundColor: '#313344' }}>
        
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
              
              {/* Context Indicator */}
              {contextPercentage >= 1 && (
                <div className="flex items-center space-x-2">
                  <ContextIndicator 
                    percentage={contextPercentage}
                    size={36}
                    strokeWidth={3}
                    className="opacity-90"
                  />
                </div>
              )}
              
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
              <div className="flex-1 overflow-y-auto space-y-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-transparent scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {initialLoading && (
                  <div className="text-white/70 text-sm">Loading conversation…</div>
                )}
                {!initialLoading && messages.length === 0 && !sending && (
                  <div className="text-white/70 text-sm">Ask Neria anything about your channel, strategy, or latest stats.</div>
                )}
                {!initialLoading && messages.map((m) => (
                  <div key={m.id}>
                    {m.role === 'user' ? (
                      <div 
                        className="px-4 py-3 text-white text-base leading-relaxed ml-auto max-w-[85%]"
                        style={{ backgroundColor: '#3086ff', borderRadius: '12px' }}
                      >
                        {m.content}
                      </div>
                    ) : (
                      <div className="text-white space-y-4 max-w-[85%]">
                        <div className="text-base leading-relaxed opacity-90 whitespace-pre-wrap">{parseMarkdownLinks(m.content)}</div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
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
              <form
                id="neriaChatForm"
                className="w-full"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!sending) {
                    sendMessage();
                  }
                }}
              >
                <input
                  name="neriaInput"
                  type="text"
                  placeholder="Ask Neria about your YouTube strategy..."
                  className="w-full px-4 py-3 bg-transparent border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  style={{ borderRadius: '12px' }}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!sending) sendMessage();
                    }
                  }}
                  disabled={sending}
                />
              </form>
            </div>
            
            {/* Send Button */}
            <button 
              type="button"
              className="w-10 h-10 text-white flex items-center justify-center transition-colors hover:bg-blue-600"
              style={{ 
                backgroundColor: '#3086ff',
                borderRadius: '12px'
              }}
              aria-label="Send message"
              onClick={() => { if (!sending) sendMessage(); }}
              disabled={sending}
            >
              {!sending ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 19V5M5 12L12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" className="animate-spin" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                  <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NeriaContainer;
