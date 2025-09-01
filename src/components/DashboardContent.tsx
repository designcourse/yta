'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();

  // Derive basePath for ChannelSelector from current pathname if it contains a known section
  const derivedBasePath = React.useMemo(() => {
    if (!pathname) return basePath;
    // Match /dashboard/:channelId/<section>
    const match = pathname.match(/^\/dashboard\/[^/]+\/(.+)$/);
    if (match && match[1]) {
      return `/dashboard/[channelId]/${match[1]}`;
    }
    return basePath;
  }, [pathname, basePath]);

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
      <div className="flex-1 ml-[20px] h-screen overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#B2B5D1] [&::-webkit-scrollbar-thumb]:rounded-full scrollbar-thin scrollbar-thumb-[#B2B5D1] scrollbar-track-transparent">
        {/* Header with Channel Selector */}
        {showChannelSelector && (
          <header className="h-[104px] flex items-center justify-end px-5">
            <ChannelSelector 
              channels={channels}
              currentChannelId={currentChannelId}
              basePath={derivedBasePath}
            />
          </header>
        )}

        {/* Main Content */}
        <main className={`px-5 ${showChannelSelector ? 'pt-12' : 'pt-20'} pb-12`}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardContent;
