'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface NeriaContextType {
  isFullscreen: boolean;
  setIsFullscreen: (isFullscreen: boolean) => void;
  currentChannelId?: string;
  setCurrentChannelId: (id?: string) => void;
  isOverlayActive: boolean;
  setIsOverlayActive: (active: boolean) => void;
  // Thumbnail creation mode state
  thumbnailModeActive: boolean;
  setThumbnailModeActive: (active: boolean) => void;
  planId?: string;
  setPlanId: (id?: string) => void;
  selectedReferencePhotoIds: string[];
  setSelectedReferencePhotoIds: (ids: string[]) => void;
  textInThumbnail: string;
  setTextInThumbnail: (text: string) => void;
  generationLoading: boolean;
  setGenerationLoading: (loading: boolean) => void;
  generatedThumbnails: Array<{ id: string; key: string; url?: string }>;
  setGeneratedThumbnails: (items: Array<{ id: string; key: string; url?: string }>) => void;
  selectedThumbnailUrl?: string;
  setSelectedThumbnailUrl: (url?: string) => void;
  approvalCandidate?: { id: string; url?: string };
  setApprovalCandidate: (c?: { id: string; url?: string }) => void;
}

const NeriaContext = createContext<NeriaContextType | undefined>(undefined);

export const useNeria = () => {
  const context = useContext(NeriaContext);
  if (context === undefined) {
    throw new Error('useNeria must be used within a NeriaProvider');
  }
  return context;
};

interface NeriaProviderProps {
  children: ReactNode;
}

export const NeriaProvider: React.FC<NeriaProviderProps> = ({ children }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentChannelId, setCurrentChannelId] = useState<string | undefined>(undefined);
  const [isOverlayActive, setIsOverlayActive] = useState<boolean>(false);
  const [thumbnailModeActive, setThumbnailModeActive] = useState<boolean>(false);
  const [planId, setPlanId] = useState<string | undefined>(undefined);
  const [selectedReferencePhotoIds, setSelectedReferencePhotoIds] = useState<string[]>([]);
  const [textInThumbnail, setTextInThumbnail] = useState<string>("");
  const [generationLoading, setGenerationLoading] = useState<boolean>(false);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<Array<{ id: string; key: string; url?: string }>>([]);
  const [selectedThumbnailUrl, setSelectedThumbnailUrl] = useState<string | undefined>(undefined);
  const [approvalCandidate, setApprovalCandidate] = useState<{ id: string; url?: string } | undefined>(undefined);

  return (
    <NeriaContext.Provider value={{
      isFullscreen,
      setIsFullscreen,
      currentChannelId,
      setCurrentChannelId,
      isOverlayActive,
      setIsOverlayActive,
      thumbnailModeActive,
      setThumbnailModeActive,
      planId,
      setPlanId,
      selectedReferencePhotoIds,
      setSelectedReferencePhotoIds,
      textInThumbnail,
      setTextInThumbnail,
      generationLoading,
      setGenerationLoading,
      generatedThumbnails,
      setGeneratedThumbnails,
      selectedThumbnailUrl,
      setSelectedThumbnailUrl,
      approvalCandidate,
      setApprovalCandidate,
    }}>
      {children}
    </NeriaContext.Provider>
  );
};
