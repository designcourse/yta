'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ScriptView, { ScriptData } from './ScriptView';
import NoScriptLayout from './NoScriptLayout';

export default function ScriptContainer({ planId }: { planId: string }) {
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<ScriptData | null>(null);

  const fetchScript = async () => {
    try {
      const res = await fetch(`/api/scripts?planId=${encodeURIComponent(planId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setScript(data.script);
    } catch {}
  };

  useEffect(() => {
    fetchScript();
  }, [planId]);

  useEffect(() => {
    const onGenerating = () => {
      setLoading(true);
    };
    const onGenerated = () => {
      setLoading(false);
      fetchScript();
    };
    const onError = () => {
      setLoading(false);
    };
    window.addEventListener('script-generating', onGenerating as EventListener);
    window.addEventListener('script-generated', onGenerated as EventListener);
    window.addEventListener('script-error', onError as EventListener);
    return () => {
      window.removeEventListener('script-generating', onGenerating as EventListener);
      window.removeEventListener('script-generated', onGenerated as EventListener);
      window.removeEventListener('script-error', onError as EventListener);
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-[100px] w-full flex items-center justify-center py-10">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="mt-[100px] w-full">
        <NoScriptLayout />
      </div>
    );
  }

  return (
    <div className="mt-[100px] w-full">
      <ScriptView script={script} />
    </div>
  );
}


