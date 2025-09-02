import React, { useEffect, useState } from 'react';
import SimpleDropdown from './SimpleDropdown';
import PresignedImage from './PresignedImage';

// Assets exported by Figma tool into public/figma
const imgIconParkSolidDownOne = "/figma/dcd4d51eb39bfadd74010532e40b8d4bcb96a7f5.svg";
const imgGroup = "/figma/2a764f91e4b98b691fab9c636f3879f683be1977.svg";

interface Photo {
  id: string;
  url?: string | null;
  file_key: string;
}

export default function ThumbnailModal() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);

  // Try to infer channelId from URL: /dashboard/[channelId]/...
  const channelId = typeof window !== 'undefined' ? decodeURIComponent((window.location.pathname.split('/')[2] || '')) : '';

  useEffect(() => {
    const load = async () => {
      if (!channelId) return;
      const res = await fetch(`/api/reference-photos?channelId=${encodeURIComponent(channelId)}`);
      if (res.ok) {
        const data = await res.json();
        setPhotos(data.photos || []);
      }
    };
    load();
  }, [channelId]);
  return (
    <div
      className="bg-[#eff0f9] box-border content-stretch flex flex-col gap-8 items-start justify-start overflow-clip p-[48px] relative rounded-[12px] size-full"
      data-name="Thumbnail Modal"
      data-node-id="74:343"
    >
      <div className="content-stretch flex gap-7 items-center justify-start relative shrink-0 w-full" data-name="Options" data-node-id="74:386">
        <SimpleDropdown label="Text in Thumbnail" value="MCP" className="w-[220px]" />
        <SimpleDropdown label="Text Treatment" value="3D Chrome" className="w-[220px]" />
        <SimpleDropdown label="Style" value="MrBeast Thumbs" className="w-[220px]" />
      </div>
      <div className="font-['Inter:Bold',_sans-serif] font-bold leading-[0] min-w-full not-italic relative shrink-0 text-[20px] text-black" data-node-id="74:358" style={{ width: 'min-content' }}>
        <p className="leading-[30px]">Reference Photos</p>
      </div>
      <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-name="Reference Container" data-node-id="74:390">
        <div className="basis-0 box-border content-stretch flex flex-col gap-3 grow h-[143px] items-start justify-start min-h-px min-w-px overflow-hidden p-[24px] relative shrink-0" data-name="References Container" data-node-id="74:388">
          <div className="content-stretch flex gap-[26px] items-center justify-start relative shrink-0 w-full overflow-x-auto">
            {photos.length === 0 && (
              <>
                <div className="basis-0 bg-[#e0e2ee] grow h-[84px] min-h-px min-w-px rounded-[9px] shrink-0" />
                <div className="basis-0 bg-[#e0e2ee] grow h-[84px] min-h-px min-w-px rounded-[9px] shrink-0" />
                <div className="basis-0 bg-[#e0e2ee] grow h-[84px] min-h-px min-w-px rounded-[9px] shrink-0" />
                <div className="basis-0 bg-[#e0e2ee] grow h-[84px] min-h-px min-w-px rounded-[9px] shrink-0" />
              </>
            )}
            {photos.map((p) => (
              <PresignedImage key={p.id} fileKey={p.file_key} fallbackUrl={p.url || undefined} />
            ))}
          </div>
        </div>
        <div className="relative rounded-[8px] shrink-0" data-name="Upload Reference CTA" data-node-id="74:349">
          <label className="box-border content-stretch flex gap-[9px] items-center justify-center overflow-clip p-[32px] relative cursor-pointer">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length || !channelId) return;
                setUploading(true);
                try {
                  const uploaded: { key: string; url?: string; contentType?: string; size?: number }[] = [];
                  for (const file of files) {
                    const presign = await fetch('/api/s3-presign', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ fileName: file.name, contentType: file.type })
                    });
                    const data = await presign.json();
                    if (!presign.ok) throw new Error(data.error || 'presign failed');
                    await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
                    uploaded.push({ key: data.key, url: data.publicUrl, contentType: file.type, size: file.size });
                  }
                  // save records
                  const save = await fetch('/api/reference-photos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channelId, items: uploaded })
                  });
                  const { photos: saved } = await save.json();
                  if (save.ok) setPhotos((prev) => [...saved, ...prev]);
                } finally {
                  setUploading(false);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <div className="content-stretch flex gap-[9px] items-center justify-start relative shrink-0" data-name="Inner" data-node-id="74:389">
              <div className="overflow-clip relative shrink-0 size-[18px]" data-name="icon-park-outline:picture" data-node-id="74:351">
                {!uploading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img alt="" className="block max-w-none" src={imgGroup} />
                  </div>
                ) : (
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="#3086ff" strokeOpacity="0.3" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="#3086ff" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <div className="font-['Inter:Bold',_sans-serif] font-bold leading-[0] not-italic relative shrink-0 text-[16px] text-black text-nowrap opacity-100" data-node-id="74:350">
                <p className="leading-[24px] whitespace-pre">{uploading ? 'Uploading…' : 'Upload References'}</p>
              </div>
            </div>
          </label>
          <div aria-hidden="true" className="absolute border border-[#c9cbdd] border-solid inset-0 pointer-events-none rounded-[8px]" />
        </div>
      </div>
      <div className="content-stretch flex gap-6 items-center justify-start relative shrink-0 w-full" data-name="Generated Thumbs Container" data-node-id="74:391">
        <div className="basis-0 flex flex-row grow items-center self-stretch shrink-0">
          <div className="basis-0 bg-[#e0e2ee] grow h-full min-h-px min-w-px rounded-[12px] shrink-0" data-name="Thumbs" data-node-id="74:344" />
        </div>
        <div className="basis-0 flex flex-row grow items-center self-stretch shrink-0">
          <div className="basis-0 bg-[#e0e2ee] grow h-full min-h-px min-w-px relative rounded-[12px] shrink-0" data-name="Thumbs" data-node-id="74:355">
            <div aria-hidden="true" className="absolute border-[#3086ff] border-[3px] border-solid inset-0 pointer-events-none rounded-[12px]" />
          </div>
        </div>
        <div className="basis-0 flex flex-row grow items-center self-stretch shrink-0">
          <div className="basis-0 bg-[#e0e2ee] grow h-full min-h-px min-w-px rounded-[12px] shrink-0" data-name="Thumbs" data-node-id="74:356" />
        </div>
      </div>
      <div className="absolute left-[312px] size-[100px] top-[152px]" data-node-id="74:380" />
      {/* Close icon handled by parent container to avoid duplicates */}
    </div>
  );
}


