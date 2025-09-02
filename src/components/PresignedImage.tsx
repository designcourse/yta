"use client";

import React, { useEffect, useState } from "react";

export default function PresignedImage({ fileKey, fallbackUrl }: { fileKey: string; fallbackUrl?: string }) {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/s3-presign-get?key=${encodeURIComponent(fileKey)}`);
        if (!res.ok) throw new Error('presign get failed');
        const data = await res.json();
        if (!cancelled) setUrl(data.url || fallbackUrl);
      } catch {
        if (!cancelled) setUrl(fallbackUrl);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fileKey, fallbackUrl]);

  return (
    <div className="h-[84px] w-[140px] bg-[#e0e2ee] rounded-[9px] overflow-hidden shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="ref" className="w-full h-full object-cover" />}
    </div>
  );
}


