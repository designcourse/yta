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
      setNeriaResponse(data.neriaResponse || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };



  return <CollectionHero neriaResponse={neriaResponse} />;
}
