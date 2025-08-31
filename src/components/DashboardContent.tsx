'use client';

import React from 'react';
import { useNeria } from './NeriaContext';
import DashboardSidebar from './DashboardSidebar';
import ChannelSelector from './ChannelSelector';

interface DashboardContentProps {
  children: React.ReactNode;
  channels: any[];
  currentChannelId?: string;
  showChannelSelector?: boolean;
  basePath?: string;
}

const DashboardContent: React.FC<DashboardContentProps> = ({
  children,
  channels,
  currentChannelId,
  showChannelSelector = true,
  basePath = "/dashboard"
}) => {
  const { isFullscreen, setCurrentChannelId } = useNeria();

  React.useEffect(() => {
    console.log('DashboardContent: Setting currentChannelId to:', currentChannelId);
    setCurrentChannelId(currentChannelId);
  }, [currentChannelId, setCurrentChannelId]);

  return (
    <div 
      className="ml-[213px] flex" 
      style={{ 
        width: isFullscreen ? 'calc(100% - 213px)' : 'calc(100% - 213px - min(460px, 25vw))'
      }}
    >
      {/* Sidebar - Fixed width */}
      <DashboardSidebar 
        channels={channels} 
        currentChannelId={currentChannelId}
      />

      {/* Main Content Area */}
      <div className="flex-1 ml-[20px]">
        {/* Header with Channel Selector */}
        {showChannelSelector && (
          <header className="h-[104px] flex items-center justify-end px-5">
            <ChannelSelector 
              channels={channels}
              currentChannelId={currentChannelId}
              basePath={basePath}
            />
          </header>
        )}

        {/* Main Content */}
        <main className={`px-5 ${showChannelSelector ? 'pt-12' : 'pt-20'}`}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardContent;
