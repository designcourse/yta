'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import CollectionHero from '@/components/CollectionHero';
import NeriaResponse from '@/components/NeriaResponse';

export default function CollectionPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [channelData, setChannelData] = useState<any>(null);
  const [neriaResponse, setNeriaResponse] = useState<string | null>(null);
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

    console.log("🔍 Starting data collection for channel:", channelId);

    try {
      console.log("🔍 Calling /api/collect-youtube-data...");
      const startTime = Date.now();

      const response = await fetch('/api/collect-youtube-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId }),
      });

      const endTime = Date.now();
      console.log("🔍 API call completed in", endTime - startTime, "ms");

      if (!response.ok) {
        console.error("❌ API call failed with status:", response.status);
        const errorText = await response.text();
        console.error("❌ API error response:", errorText);
        throw new Error(`Failed to collect data: ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ API response received:", {
        hasNeriaResponse: !!data.neriaResponse,
        neriaResponseLength: data.neriaResponse?.length || 0,
        subscriberCount: data.subscriberCount,
        videoCount: data.videoCount,
        title: data.title
      });

      setChannelData(data);
      setNeriaResponse(data.neriaResponse || null);

      if (!data.neriaResponse) {
        console.warn("⚠️ No Neria response received - check server logs for details");
      }
    } catch (err) {
      console.error("❌ Data collection error:", err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };



  return <CollectionHero neriaResponse={neriaResponse} />;
}
