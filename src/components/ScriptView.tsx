'use client';

import React from 'react';

export type ScriptResource = { id: string; label: string | null; url: string; position?: number };
export type ScriptSection = {
  id: string;
  position: number;
  start_time_seconds: number;
  title: string;
  summary: string;
  resources: ScriptResource[];
};

export type ScriptData = {
  id: string;
  status: string;
  duration_seconds: number | null;
  requested_prompt: string | null;
  model: string | null;
  sections: ScriptSection[];
};

function formatTimestamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString();
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function ScriptView({ script }: { script: ScriptData }) {
  if (!script?.sections?.length) return null;

  return (
    <div className="flex flex-col gap-6 w-full">
      {script.sections.map((sec) => (
        <div key={sec.id} className="flex gap-6 w-full items-start">
          <div className="flex items-center gap-2 shrink-0">
            <div className="font-bold text-[22px] text-black">
              <p>{formatTimestamp(Math.max(0, Math.floor(sec.start_time_seconds || 0)))}</p>
            </div>
            <div className="w-[9.326px] h-[9.326px] rounded-full bg-[#3086ff]" />
          </div>
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <div className="font-bold text-[22px] text-black leading-none min-w-full" style={{ width: 'min-content' }}>
              <p>{sec.title}</p>
            </div>
            <div className="text-gray-800 whitespace-pre-line min-w-full">
              <p>{sec.summary}</p>
            </div>
            {sec.resources && sec.resources.length > 0 && (
              <div className="flex flex-col items-start gap-2">
                {sec.resources.slice(0, 5).map((r) => (
                  <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[14px] text-[#025ddd] font-bold underline">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M10 14a5 5 0 0 0 7.07 0l1.9-1.9a5 5 0 0 0-7.07-7.07L10.9 6" stroke="#025ddd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 10a5 5 0 0 0-7.07 0l-1.9 1.9a5 5 0 1 0 7.07 7.07L13.1 18" stroke="#025ddd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>{r.label || 'Resource'}</span>
                  </a>
                ))}
              </div>
            )}
            <div className="flex gap-4 items-center">
              <button type="button" className="relative w-[195px] h-[46px] rounded-[40px] border border-[#c9cbdd]">
                <div className="absolute inset-0 flex items-center justify-center gap-3 p-2">
                  <span className="text-[16px]">Generate Assets</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


