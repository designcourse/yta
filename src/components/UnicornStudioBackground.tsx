'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    UnicornStudio: {
      isInitialized: boolean;
      init: () => void;
    };
  }
}

export default function UnicornStudioBackground() {
  useEffect(() => {
    // Initialize Unicorn Studio if not already initialized
    if (!window.UnicornStudio) {
      window.UnicornStudio = { isInitialized: false };
      
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.30/dist/unicornStudio.umd.js';
      script.onload = function() {
        if (!window.UnicornStudio.isInitialized) {
          window.UnicornStudio.init();
          window.UnicornStudio.isInitialized = true;
        }
      };
      
      (document.head || document.body).appendChild(script);
    }
  }, []);

  return (
    <div 
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 1 }}
    >
      <div 
        data-us-project="0OpN2ZmD6UCxxSJCJZHr" 
        style={{ width: '1440px', height: '900px', width: '100%', height: '100%' }}
      />
    </div>
  );
}
