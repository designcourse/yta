'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface NeriaContextType {
  isFullscreen: boolean;
  setIsFullscreen: (isFullscreen: boolean) => void;
  currentChannelId?: string;
  setCurrentChannelId: (id?: string) => void;
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

  return (
    <NeriaContext.Provider value={{ isFullscreen, setIsFullscreen, currentChannelId, setCurrentChannelId }}>
      {children}
    </NeriaContext.Provider>
  );
};
