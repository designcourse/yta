"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Channel {
  id: string;
  channel_id: string;
  title: string;
}

interface ChannelSelectorProps {
  channels: Channel[];
  currentChannelId?: string;
  basePath?: string; // e.g., "/dashboard", "/dashboard/planner"
}

export default function ChannelSelector({ 
  channels, 
  currentChannelId, 
  basePath = "/dashboard" 
}: ChannelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const currentChannel = channels.find(c => c.channel_id === currentChannelId);

  const handleChannelSelect = async (channelId: string) => {
    setIsOpen(false);
    
    // Update the last used channel in the database
    try {
      await fetch('/api/update-last-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId }),
      });
    } catch (error) {
      console.error('Failed to update last used channel:', error);
    }

    const newPath = basePath.includes("[channelId]") 
      ? basePath.replace("[channelId]", encodeURIComponent(channelId))
      : `${basePath}/${encodeURIComponent(channelId)}`;
    router.push(newPath);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-[233px] h-14 px-5 py-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          {/* YouTube Icon */}
          <div className="w-5 h-4 flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="#FF0000" className="w-full h-full">
              <path d="M23.498 6.186a2.998 2.998 0 0 0-2.123-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.375.505A2.998 2.998 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a2.998 2.998 0 0 0 2.123 2.136C4.495 20.455 12 20.455 12 20.455s7.505 0 9.375-.505a2.998 2.998 0 0 0 2.123-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </div>
          <span className="text-base text-gray-900 truncate">
            {currentChannel?.title || currentChannel?.channel_id || "Select Channel"}
          </span>
        </div>
        {/* Down Arrow */}
        <svg
          className={`w-6 h-6 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => handleChannelSelect(channel.channel_id)}
              className="flex items-center gap-2 w-full px-5 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
            >
              <div className="w-5 h-4 flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="#FF0000" className="w-full h-full">
                  <path d="M23.498 6.186a2.998 2.998 0 0 0-2.123-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.375.505A2.998 2.998 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a2.998 2.998 0 0 0 2.123 2.136C4.495 20.455 12 20.455 12 20.455s7.505 0 9.375-.505a2.998 2.998 0 0 0 2.123-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <span className="text-base text-gray-900 truncate">
                {channel.title || channel.channel_id}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
