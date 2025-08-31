"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

interface SidebarProps {
  channels: Array<{
    id: string;
    channel_id: string;
    title: string;
  }>;
  currentChannelId?: string;
}

export default function DashboardSidebar({ channels, currentChannelId }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleWipeData = async () => {
    if (confirm('Are you sure you want to wipe all your data? This will delete all channels and Google accounts and cannot be undone.')) {
      try {
        const response = await fetch('/api/wipe-all-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const result = await response.json();

        if (result.success) {
          alert('All data has been wiped successfully.');
          router.push('/');
        } else {
          alert('Error: ' + (result.error || 'Failed to wipe data'));
        }
      } catch (error) {
        console.error('Error wiping data:', error);
        alert('Error: Failed to wipe data');
      }
    }
  };

  const connectYouTube = () => {
    const popup = window.open('/youtube-connect', 'youtube', 'width=500,height=600');
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'youtube-connected') {
        popup?.close();
        const channelIds = event.data.channelIds;
        if (channelIds && channelIds.length > 0) {
          // Redirect to collection page with the newly added channel
          router.push(`/dashboard/collection?channelId=${encodeURIComponent(channelIds[0])}`);
        } else {
          // Fallback to refresh if no channel IDs
          router.refresh();
        }
      }
    });
  };

  const isActivePath = (path: string) => {
    return pathname === path;
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[213px] border-r border-gray-200 flex flex-col">
      {/* Sidebar Top */}
      <div className="px-7 py-9 flex-1">
        {/* Logo */}
        <div className="mb-28">
          {currentChannelId ? (
            <Link 
              href={`/dashboard/${encodeURIComponent(currentChannelId)}`}
              className="block hover:opacity-80 transition-opacity"
            >
              <img 
                src="/logo.svg" 
                alt="Logo" 
                className="h-4 w-auto"
              />
            </Link>
          ) : (
            <img 
              src="/logo.svg" 
              alt="Logo" 
              className="h-6 w-auto"
            />
          )}
        </div>

        {/* Sidebar Nav */}
        {currentChannelId && (
          <nav className="space-y-5 mb-9 font-bold">
            <Link
              href={`/dashboard/${encodeURIComponent(currentChannelId)}/latest-video`}
              className={`block text-base ${
                isActivePath(`/dashboard/${currentChannelId}/latest-video`)
                  ? "text-gray-900 font-bold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Latest Video
            </Link>
            <Link
              href={`/dashboard/${encodeURIComponent(currentChannelId)}/planner`}
              className={`block text-base ${
                isActivePath(`/dashboard/${currentChannelId}/planner`)
                  ? "text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Video Planner
            </Link>
            <Link
              href={`/dashboard/${encodeURIComponent(currentChannelId)}/best-performing`}
              className={`block text-base ${
                isActivePath(`/dashboard/${currentChannelId}/best-performing`)
                  ? "text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Best Performing
            </Link>
            <Link
              href={`/dashboard/${encodeURIComponent(currentChannelId)}/worst-performing`}
              className={`block text-base ${
                isActivePath(`/dashboard/${currentChannelId}/worst-performing`)
                  ? "text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Worst Performing
            </Link>
          </nav>
        )}

        {/* Divider */}
        <div className="border-t border-gray-200 my-9"></div>

        {/* Sidebar Subnav */}
        {currentChannelId && (
          <nav className="space-y-4">
            <Link
              href={`/dashboard/${encodeURIComponent(currentChannelId)}/my-goals`}
              className={`block text-base ${
                isActivePath(`/dashboard/${currentChannelId}/my-goals`)
                  ? "text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              My Goals
            </Link>
            <Link
              href={`/dashboard/${encodeURIComponent(currentChannelId)}/thumbnail-content`}
              className={`block text-base ${
                isActivePath(`/dashboard/${currentChannelId}/thumbnail-content`)
                  ? "text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Thumbnail Content
            </Link>
          </nav>
        )}
      </div>

      {/* Sidebar Bottom */}
      <div className="px-7 pb-9 space-y-4">
        {/* Add Channel */}
        <button
          onClick={connectYouTube}
          className="flex items-center gap-2 w-full p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-left"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="text-base text-gray-900">Add Channel</span>
        </button>

        {/* Footer Nav */}
        <nav className="space-y-4 pt-4">
          <Link
            href="/account"
            className="block text-base text-gray-600 hover:text-gray-900"
          >
            Account Settings
          </Link>
          <Link
            href="/support"
            className="block text-base text-gray-600 hover:text-gray-900"
          >
            Support
          </Link>
          <button
            onClick={handleLogout}
            className="block text-base text-gray-600 hover:text-gray-900 text-left"
          >
            Logout
          </button>
          <button
            onClick={handleWipeData}
            className="block text-base text-red-600 hover:text-red-800 text-left"
          >
            Wipe all data
          </button>
        </nav>
      </div>
    </aside>
  );
}
