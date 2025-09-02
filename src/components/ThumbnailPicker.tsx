'use client';

import React, { useState, useEffect } from 'react';
import ThumbnailModal from './ThumbnailModal';
import { useNeria } from './NeriaContext';

interface ThumbnailPickerProps {
  thumbnailUrl?: string | null;
}

export default function ThumbnailPicker({ thumbnailUrl }: ThumbnailPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { setIsOverlayActive } = useNeria();

  useEffect(() => {
    setIsOverlayActive(isOpen);
    return () => { setIsOverlayActive(false); };
  }, [isOpen, setIsOverlayActive]);

  return (
    <div className="w-full h-[221px] flex items-center justify-center relative" style={{ backgroundColor: '#D7D9F2' }}>
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="Selected thumbnail" className="w-full h-full object-cover"/>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="px-6 py-2 rounded-full font-bold text-white"
          style={{ backgroundColor: '#3086ff' }}
        >
          Choose Thumbnail
        </button>
      )}

      {isOpen && (
        <>
          {/* Dim overlay that should not cover Neria container (z-50). Also clickable to close. */}
          <button aria-label="Close" onClick={() => setIsOpen(false)} className="fixed inset-0 bg-black/60" style={{ zIndex: 40 }} />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }} onClick={() => setIsOpen(false)}>
            <div className="relative w-full max-w-[960px]" onClick={(e) => e.stopPropagation()}>
              {/* Close icon */}
              

              <div className="rounded-[12px] overflow-hidden relative">
                {/* Close icon inside modal, with more spacing */}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setIsOpen(false)}
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


