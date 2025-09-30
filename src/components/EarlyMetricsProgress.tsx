"use client";

import { useEffect, useState } from "react";

interface Props {
  publishedAt: string;
}

export default function EarlyMetricsProgress({ publishedAt }: Props) {
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    const updateProgress = () => {
      const published = new Date(publishedAt).getTime();
      const now = Date.now();
      const elapsed = now - published;
      const threeHours = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
      
      const progressPercent = Math.min((elapsed / threeHours) * 100, 100);
      setProgress(progressPercent);
      
      if (elapsed >= threeHours) {
        setIsUnlocked(true);
        setTimeRemaining("Unlocked!");
      } else {
        setIsUnlocked(false);
        const remaining = threeHours - elapsed;
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        
        if (hours > 0) {
          setTimeRemaining(`${hours}h ${minutes}m remaining`);
        } else {
          setTimeRemaining(`${minutes}m remaining`);
        }
      }
    };

    // Update immediately
    updateProgress();
    
    // Update every minute
    const interval = setInterval(updateProgress, 60000);
    
    return () => clearInterval(interval);
  }, [publishedAt]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isUnlocked ? 'bg-green-100' : 'bg-blue-100'
          }`}>
            {isUnlocked ? (
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
          </div>
          <div>
            <div className="font-semibold text-gray-900">
              {isUnlocked ? '3-Hour Metrics Unlocked!' : '3-Hour Metrics Unlocking'}
            </div>
            <div className="text-sm text-gray-600 mt-0.5">
              Uploaded {formatDate(publishedAt)}
            </div>
          </div>
        </div>
        
        <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
          isUnlocked 
            ? 'bg-green-100 text-green-700' 
            : 'bg-blue-100 text-blue-700'
        }`}>
          {timeRemaining}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div 
            className={`h-full transition-all duration-1000 ease-out rounded-full ${
              isUnlocked 
                ? 'bg-gradient-to-r from-green-500 to-emerald-500' 
                : 'bg-gradient-to-r from-blue-500 to-indigo-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>0m</span>
          <span className="font-medium">
            {Math.round(progress)}% complete
          </span>
          <span>180m (3h)</span>
        </div>
      </div>

      {!isUnlocked && (
        <div className="mt-3 text-xs text-gray-600 bg-white/50 rounded p-2">
          💡 <span className="font-medium">Early performance snapshot</span> will be captured automatically at the 3-hour mark and compared to your historical baseline
        </div>
      )}

      {isUnlocked && (
        <div className="mt-3 text-xs text-green-700 bg-green-50 rounded p-2">
          ✅ <span className="font-medium">Metrics are ready!</span> View your 3-hour performance snapshot below
        </div>
      )}
    </div>
  );
}



