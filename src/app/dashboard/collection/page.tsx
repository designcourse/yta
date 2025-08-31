'use client';

import { useState, useEffect, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import CollectionHero from '@/components/CollectionHero';
import NeriaResponse from '@/components/NeriaResponse';
import PromptBar from '@/components/PromptBar';

export default function CollectionPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [channelData, setChannelData] = useState<any>(null);
  const [neriaResponse, setNeriaResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<'intro' | 'question' | 'strategy' | 'refinement' | 'complete'>('intro');
  const [showPrompt, setShowPrompt] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [sending, setSending] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [qaDone, setQaDone] = useState(false);
  const [strategyGenerated, setStrategyGenerated] = useState(false);
  const [currentStrategy, setCurrentStrategy] = useState<string | null>(null);
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
      setDisplayMode('intro');

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

  const fetchNextQuestion = async () => {
    if (!channelId) return;
    try {
      console.log('🔍 Fetching next question...');
      const res = await fetch('/api/neria/next-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) throw new Error('Failed to get next question');
      const data = await res.json();
      console.log('🔍 Next question response:', data);
      
      if (data.status === 'done') {
        console.log('🔍 Q&A done, starting strategy generation');
        setQaDone(true);
        setShowPrompt(false);
        setCurrentQuestion(null);
        // Start strategy generation
        generateStrategy();
      } else if (data.status === 'question' && data.question) {
        console.log('🔍 Setting up question:', data.question);
        // Animate Neria asking the question
        setIsTransitioning(true);
        setDisplayMode('question');
        setCurrentQuestion(data.question as string);
        setNeriaResponse(data.question as string);
        setShowPrompt(false); // Hide prompt until animation completes
        
        // Fallback: if animation doesn't start, show prompt after 5 seconds (increased timeout)
        setTimeout(() => {
          if (!showPrompt) {
            console.log('🔍 Fallback: showing prompt after 5s timeout');
            setShowPrompt(true);
            setIsTransitioning(false);
          }
        }, 5000);
      }
    } catch (e) {
      console.error('❌ fetchNextQuestion error:', e);
      // Show prompt anyway so user isn't stuck
      setShowPrompt(true);
      setIsTransitioning(false);
    }
  };

  const generateStrategy = async () => {
    if (!channelId) return;
    try {
      const res = await fetch('/api/neria/generate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) throw new Error('Failed to generate strategy');
      const data = await res.json();
      setCurrentStrategy(data.strategy);
      setNeriaResponse(data.strategy);
      setDisplayMode('strategy');
      setStrategyGenerated(true);
    } catch (e) {
      console.error('Strategy generation failed:', e);
    }
  };

  const handleNeriaComplete = () => {
    console.log('🔍 handleNeriaComplete called, displayMode:', displayMode);
    if (displayMode === 'intro') {
      // After intro completes, ask OpenAI for the next question
      console.log('🔍 Intro complete, fetching next question');
      fetchNextQuestion();
    } else if (displayMode === 'question') {
      // After question animation completes, show prompt input and keep the question text visible
      console.log('🔍 Question animation complete, showing prompt');
      setShowPrompt(true);
      setIsTransitioning(false);
      // Don't change neriaResponse here - keep the question visible
    } else if (displayMode === 'strategy') {
      // After strategy completes, show prompt for feedback
      console.log('🔍 Strategy complete, showing prompt');
      setShowPrompt(true);
      setIsTransitioning(false);
    } else if (displayMode === 'refinement') {
      // After refinement completes, show prompt again
      console.log('🔍 Refinement complete, showing prompt');
      setShowPrompt(true);
      setIsTransitioning(false);
    }
  };

  const handleExitComplete = () => {
    // Called when exit animation finishes, can be used for additional cleanup
    setIsTransitioning(false);
  };

  const handleSendAnswer = async () => {
    if (!answerText.trim()) return;
    setSending(true);
    
    try {
      if (displayMode === 'question' && currentQuestion) {
        // Handle Q&A phase
        const { data: channelRecord } = await supabase
          .from('channels')
          .select('id')
          .eq('channel_id', channelId)
          .single();
        if (!channelRecord) throw new Error('Channel record not found');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error: insertError } = await supabase
          .from('channel_questions')
          .insert({
            user_id: user.id,
            channel_id: channelRecord.id,
            question: currentQuestion,
            answer: answerText.trim(),
          });
        if (insertError) throw insertError;

        setAnswerText('');
        // Keep prompt visible during transition to prevent flashing
        setIsTransitioning(true);
        await fetchNextQuestion();
      } else if (displayMode === 'strategy' || displayMode === 'refinement') {
        // Handle strategy refinement
        const res = await fetch('/api/neria/refine-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            channelId, 
            currentPlan: currentStrategy, 
            userFeedback: answerText.trim() 
          }),
        });
        
        if (!res.ok) throw new Error('Failed to refine plan');
        const data = await res.json();
        
        if (data.status === 'complete') {
          setDisplayMode('complete');
          setNeriaResponse('Success');
          setShowPrompt(false);
          setIsTransitioning(false);
        } else if (data.status === 'continue') {
          setCurrentStrategy(data.refinedPlan);
          setNeriaResponse(data.refinedPlan);
          setDisplayMode('refinement');
          setIsTransitioning(true);
        }
        
        setAnswerText('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <div>
        <CollectionHero 
          neriaResponse={neriaResponse} 
          onNeriaComplete={handleNeriaComplete}
          onExitComplete={handleExitComplete}
          isStrategy={displayMode === 'strategy' || displayMode === 'refinement'}
        />
      </div>
      {(showPrompt || isTransitioning) && displayMode !== 'complete' && (
        <PromptBar
          value={answerText}
          placeholder={currentQuestion || 'Type your answer...'}
          onChange={setAnswerText}
          sending={sending}
          onSend={handleSendAnswer}
        />
      )}
    </div>
  );
}
