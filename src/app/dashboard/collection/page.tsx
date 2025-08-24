'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import CollectionHero from '@/components/CollectionHero';

export default function CollectionPage() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [channelData, setChannelData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelId = searchParams.get('channelId');

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (!channelId) {
      router.push('/dashboard');
      return;
    }

    startDataCollection();
  }, [channelId]);

  const startDataCollection = async () => {
    if (!channelId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/collect-youtube-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId }),
      });

      if (!response.ok) {
        throw new Error('Failed to collect data');
      }

      const data = await response.json();
      setChannelData(data);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="text-center space-y-6">
            <div className="animate-pulse">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
            <h2 className="text-2xl font-semibold text-white">
              {isLoading ? 'Collecting Your YouTube Data...' : 'Step 1: Data Collection'}
            </h2>
            <p className="text-gray-300 max-w-md mx-auto">
              {isLoading
                ? 'Please wait while we gather your channel statistics from YouTube...'
                : 'We\'ve successfully collected your channel data!'
              }
            </p>
            {channelData && (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 max-w-md mx-auto">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{channelData.subscriberCount?.toLocaleString()}</div>
                    <div className="text-gray-300">Subscribers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{channelData.videoCount?.toLocaleString()}</div>
                    <div className="text-gray-300">Videos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{channelData.viewCount?.toLocaleString()}</div>
                    <div className="text-gray-300">Total Views</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{channelData.accountAge}</div>
                    <div className="text-gray-300">Account Age</div>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-red-300">{error}</p>
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white">Data Collection Complete!</h2>
            <p className="text-gray-300 max-w-md mx-auto">
              Your YouTube channel data has been successfully collected and stored.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Continue to Dashboard
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <CollectionHero />
    </>
  );
}
