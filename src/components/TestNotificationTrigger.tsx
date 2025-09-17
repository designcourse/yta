'use client';

import React from 'react';

// Development-only component to test notification UI
export default function TestNotificationTrigger() {
  const triggerRescueNotification = () => {
    const testNotification = {
      id: 'test-rescue-' + Date.now(),
      type: 'rescue_prompt',
      title: 'Rescue opportunity: packaging underperforming',
      body: 'Early velocity is below comparable P25 without AVD penalty. Consider updating title/thumbnail.',
      metadata: {
        video_id: 'dQw4w9WgXcQ',
        video_title: 'My Latest Video About React Hooks',
        vph: 45.2,
        vph_p25: 52.1,
        hours_since: 1.2
      },
      is_read: false,
      created_at: new Date().toISOString()
    };

    window.dispatchEvent(new CustomEvent('test-inject-notification', {
      detail: testNotification
    }));
  };

  const triggerInfoNotification = () => {
    const testNotification = {
      id: 'test-info-' + Date.now(),
      type: 'info',
      title: 'Channel milestone reached!',
      body: 'Congratulations! Your channel just hit 10,000 subscribers.',
      metadata: {
        milestone: 'subscribers',
        count: 10000
      },
      is_read: false,
      created_at: new Date().toISOString()
    };

    window.dispatchEvent(new CustomEvent('test-inject-notification', {
      detail: testNotification
    }));
  };

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed top-20 right-6 z-[99999] bg-white p-3 rounded-lg shadow-xl border-2 border-red-300">
      <div className="text-sm font-bold mb-2 text-red-600">🧪 Test Notifications</div>
      <div className="space-y-2">
        <button
          onClick={triggerRescueNotification}
          className="block w-full px-3 py-2 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600 font-semibold"
        >
          Trigger Rescue Notification
        </button>
        <button
          onClick={triggerInfoNotification}
          className="block w-full px-3 py-2 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 font-semibold"
        >
          Trigger Info Notification
        </button>
      </div>
    </div>
  );
}
