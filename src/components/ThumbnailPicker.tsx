'use client';

import React, { useState, useEffect } from 'react';
import ThumbnailModal from './ThumbnailModal';
import { useNeria } from './NeriaContext';
import PresignedImage from './PresignedImage';

interface ThumbnailPickerProps {
  thumbnailUrl?: string | null;
}

export default function ThumbnailPicker({ thumbnailUrl }: ThumbnailPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { setIsOverlayActive, setThumbnailModeActive, setSelectedReferencePhotoIds, setTextInThumbnail, setGeneratedThumbnails } = useNeria();

  useEffect(() => {
    setIsOverlayActive(isOpen);
    return () => { setIsOverlayActive(false); };
  }, [isOpen, setIsOverlayActive]);

  return (
    <div className="w-full h-[221px] flex items-center justify-center relative group" style={{ backgroundColor: '#D7D9F2' }}>
      {thumbnailUrl ? (
        <>
          {(() => {
            let fileKey: string | undefined = undefined;
            try {
              const u = new URL(thumbnailUrl);
              fileKey = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
            } catch {}
            return (
              <>
                {fileKey ? (
                  <PresignedImage 
                    fileKey={fileKey} 
                    fallbackUrl={thumbnailUrl || undefined}
                    className="absolute inset-0"
                    imgClassName="w-full h-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl} alt="Selected thumbnail" className="absolute inset-0 w-full h-full object-cover"/>
                )}
              </>
            );
          })()}
          {/* Edit icon on hover */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setThumbnailModeActive(true);
              setSelectedReferencePhotoIds([]);
              setTextInThumbnail("");
              setGeneratedThumbnails([]);
            }}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-gray-700 shadow opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Edit thumbnail"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setThumbnailModeActive(true);
            setSelectedReferencePhotoIds([]);
            setTextInThumbnail("");
            setGeneratedThumbnails([]);
          }}
          className="px-6 py-2 rounded-full font-bold text-white"
          style={{ backgroundColor: '#3086ff' }}
        >
          Choose Thumbnail
        </button>
      )}

      {isOpen && (
        <>
          {/* Dim overlay that should not cover Neria container (z-50). Also clickable to close. */}
          <button aria-label="Close" onClick={() => { setIsOpen(false); setThumbnailModeActive(false); }} className="fixed inset-0 bg-black/60" style={{ zIndex: 40 }} />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }} onClick={() => { setIsOpen(false); setThumbnailModeActive(false); }}>
            <div className="relative w-full max-w-[960px]" onClick={(e) => e.stopPropagation()}>
              {/* Close icon */}
              

              <div className="rounded-[12px] overflow-hidden relative">
                {/* Close icon inside modal, with more spacing */}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => { setIsOpen(false); setThumbnailModeActive(false); }}
                  className="absolute top-3 right-3 z-[1]"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6l12 12M18 6L6 18" stroke="black" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <ThumbnailModal />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


