'use client';

import React, { useState } from 'react';

const NeriaContainer: React.FC = () => {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <div className="fixed p-4 right-0 top-0 h-screen z-50" style={{ minWidth: '380px', width: 'min(460px, 25vw)' }}>
      {/* Main Neria Container - Dark Theme */}
      <div className="h-full flex flex-col rounded-md" style={{ backgroundColor: '#313344' }}>
        
        {/* Neria Chat Area */}
        <div className="flex-1" style={{ height: 'calc(100% - 120px)' }}>
          <div className="px-6 py-8 h-full flex flex-col">
            
            {/* Neria Header */}
            <div className="flex items-center justify-between mb-8" style={{ height: '90px' }}>
              {/* Minimize/Back Button */}
              <button 
                onClick={() => setIsMinimized(!isMinimized)}
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
              <button className="w-4 h-4 flex items-center justify-center text-white hover:text-gray-300 transition-colors">
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
