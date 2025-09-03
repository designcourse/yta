import React, { useEffect, useMemo, useState } from 'react';
import SimpleDropdown from './SimpleDropdown';
import PresignedImage from './PresignedImage';
import { useNeria } from './NeriaContext';

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
  const [zoomImageUrl, setZoomImageUrl] = useState<string | undefined>(undefined);
  const { selectedReferencePhotoIds, setSelectedReferencePhotoIds, textInThumbnail, setTextInThumbnail, generationLoading, generatedThumbnails, setSelectedThumbnailUrl, selectedThumbnailUrl, setApprovalCandidate, setGeneratedThumbnails } = useNeria();

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

  // Listen for zoom image updates from NeriaContainer after an edit
  useEffect(() => {
    const handler = async (e: any) => {
      try {
        const fileKey = e?.detail?.fileKey;
        const fallbackUrl = e?.detail?.url;
        if (fileKey) {
          const res = await fetch(`/api/s3-presign-get?key=${encodeURIComponent(fileKey)}`);
          if (res.ok) {
            const data = await res.json();
            setZoomImageUrl(data.url || fallbackUrl);
            setSelectedThumbnailUrl(data.url || fallbackUrl);
          } else if (fallbackUrl) {
            setZoomImageUrl(fallbackUrl);
            setSelectedThumbnailUrl(fallbackUrl);
          }
        } else if (fallbackUrl) {
          setZoomImageUrl(fallbackUrl);
          setSelectedThumbnailUrl(fallbackUrl);
        }
      } catch {
        const fallbackUrl = e?.detail?.url;
        if (fallbackUrl) setZoomImageUrl(fallbackUrl);
      }
    };
    window.addEventListener('thumbnail-zoom-update', handler);
    return () => window.removeEventListener('thumbnail-zoom-update', handler);
  }, [setSelectedThumbnailUrl]);

  const toggleSelect = (id: string) => {
    setSelectedReferencePhotoIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  };

  const selectedSet = useMemo(() => new Set(selectedReferencePhotoIds), [selectedReferencePhotoIds]);

  return (
    <div
      className="bg-[#eff0f9] box-border content-stretch flex flex-col gap-8 items-start justify-start overflow-clip p-[48px] relative rounded-[12px] size-full"
      data-name="Thumbnail Modal"
      data-node-id="74:343"
    >
      <div className="content-stretch flex gap-7 items-center justify-start relative shrink-0 w-full" data-name="Options" data-node-id="74:386">
        {/* Faux-dropdown styled textfield */}
        <div className="relative content-stretch flex flex-col gap-[7px] items-start justify-start w-[220px]">
          <div className="font-['Inter:Bold',_sans-serif] font-bold text-[20px] leading-[30px] text-black">Text in Thumbnail</div>
          <div className="flex items-center justify-between w-[220px] h-14 px-5 py-4 bg-white border border-gray-200 rounded-lg">
            <input
              type="text"
              placeholder="Optional"
              className="w-full outline-none text-base text-gray-900"
              value={textInThumbnail}
              onChange={(e) => setTextInThumbnail(e.target.value)}
            />
          </div>
        </div>
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
              <div
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                className={`relative rounded-[9px] ${selectedSet.has(p.id) ? 'neria-loading-border' : ''}`}
                style={{ display: 'inline-block', cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(p.id); } }}
              >
                <div className="absolute -top-1 -right-1 z-10">
                  <button
                    type="button"
                    aria-label="Delete reference"
                    className="w-6 h-6 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-gray-700 shadow"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const res = await fetch(`/api/reference-photos?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
                        if (res.ok) {
                          setPhotos((prev) => prev.filter(x => x.id !== p.id));
                          setSelectedReferencePhotoIds((prev) => prev.filter(x => x !== p.id));
                        }
                      } catch {}
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
                </div>
                <PresignedImage fileKey={p.file_key} fallbackUrl={p.url || undefined} />
              </div>
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
          <div className="basis-0 bg-[#e0e2ee] grow min-h-[140px] min-w-px rounded-[12px] shrink-0 p-4 relative">
            {generationLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            )}
            {!generationLoading && generatedThumbnails.length === 0 && (
              <div className="text-gray-500 text-sm">Generated thumbnails will appear here…</div>
            )}
            {!generationLoading && generatedThumbnails.length > 0 && (
              <div className="flex gap-4 overflow-x-auto">
                {generatedThumbnails.map((it) => (
                  <div
                    key={(it as any).id || it.key}
                    className="relative group cursor-pointer"
                    onClick={async () => { 
                      console.log('=== CLICKING GENERATED THUMBNAIL ===');
                      console.log('Thumbnail object:', it);
                      console.log('File key:', it.file_key);
                      console.log('=== END CLICK ===');
                      
                      // Get presigned URL for the zoom view
                      try {
                        const res = await fetch(`/api/s3-presign-get?key=${encodeURIComponent(it.file_key)}`);
                        if (res.ok) {
                          const data = await res.json();
                          setZoomImageUrl(data.url);
                          // Prefer the permanent public URL (if available) when saving to the plan,
                          // use the short-lived presigned URL only for zoom/preview.
                          const stableUrl = (it as any).url || data.url;
                          setSelectedThumbnailUrl(stableUrl);
                          setApprovalCandidate({ id: (it as any).id, url: stableUrl, file_key: (it as any).file_key || (it as any).key });
                        }
                      } catch (e) {
                        console.error('Failed to get presigned URL:', e);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedThumbnailUrl((it as any).url); setApprovalCandidate({ id: (it as any).id, url: (it as any).url, file_key: (it as any).file_key || (it as any).key }); } }}
                  >
                    <PresignedImage fileKey={it.file_key} fallbackUrl={it.url || undefined} />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-[9px]">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 21l-5.2-5.2M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <button
                      type="button"
                      aria-label="Delete generated"
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-gray-700 shadow"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await fetch(`/api/video-thumbnails?id=${encodeURIComponent((it as any).id)}`, { method: 'DELETE' });
                          if (res.ok) {
                            setGeneratedThumbnails((prev) => prev.filter(x => (x as any).id !== (it as any).id));
                          }
                        } catch {}
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="absolute left-[312px] size-[100px] top-[152px]" data-node-id="74:380" />
      {/* Close icon handled by parent container to avoid duplicates */}

      {selectedThumbnailUrl && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-6" onClick={() => { setSelectedThumbnailUrl(undefined); setZoomImageUrl(undefined); }}>
          <div className="relative w-full max-w-[960px]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="Close"
              className="absolute top-3 right-3 z-[1]"
              onClick={() => { setSelectedThumbnailUrl(undefined); setZoomImageUrl(undefined); }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            <div className="bg-white rounded-[12px] overflow-hidden p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={zoomImageUrl || selectedThumbnailUrl} 
                alt="zoom" 
                className="w-full h-auto object-contain"
                onError={(e) => {
                  console.error('Image load error for URL:', zoomImageUrl || selectedThumbnailUrl);
                }}
              />
              <div className="mt-4 text-black">
                <p className="text-sm mb-3">If you want to make any changes to this image, just tell me what to change below. Otherwise, click the button.</p>
                <div className="flex justify-center">
                  <button
                    type="button"
                    className="px-5 py-2 rounded-full font-bold text-white"
                    style={{ backgroundColor: '#3086ff' }}
                    onClick={async () => {
                      try {
                        const planIdMatch = window.location.pathname.split('/').pop();
                        if (!planIdMatch) return;
                        await fetch('/api/video-plans', { 
                          method: 'PUT', 
                          headers: { 'Content-Type': 'application/json' }, 
                          body: JSON.stringify({ id: planIdMatch, thumbnail_url: selectedThumbnailUrl }) 
                        });
                        setApprovalCandidate(undefined);
                        setSelectedThumbnailUrl(undefined);
                        setZoomImageUrl(undefined);
                        window.location.reload();
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  >Use this thumbnail</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


