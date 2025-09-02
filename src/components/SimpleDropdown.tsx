"use client";

import React, { useState } from "react";

interface SimpleDropdownProps {
  label: string;
  value: string;
  options?: string[]; // for now single option but behaves like dropdown
  className?: string;
}

export default function SimpleDropdown({ label, value, options = [value], className }: SimpleDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={"relative content-stretch flex flex-col gap-[7px] items-start justify-start " + (className || "")}> 
      <div className="font-['Inter:Bold',_sans-serif] font-bold text-[20px] leading-[30px] text-black">{label}</div>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between w-[220px] h-14 px-5 py-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        <span className="text-base text-gray-900 truncate">{value}</span>
        <svg
          className={`w-6 h-6 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full px-5 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-gray-900"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}


