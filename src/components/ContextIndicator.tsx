'use client';

import React from 'react';

interface ContextIndicatorProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function ContextIndicator({ 
  percentage, 
  size = 32, 
  strokeWidth = 3,
  className = ""
}: ContextIndicatorProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  // Determine color based on percentage
  const getColor = (pct: number) => {
    if (pct < 50) return '#10b981'; // green-500
    if (pct < 80) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };

  const color = getColor(percentage);

  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Background circle */}
      <svg
        className="absolute inset-0"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-300 ease-in-out"
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
      
      {/* Percentage text */}
      <span 
        className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-300"
        style={{ fontSize: size * 0.28 }}
      >
        {percentage}%
      </span>
    </div>
  );
}
