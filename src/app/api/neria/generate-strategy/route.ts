import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { getValidAccessToken } from '@/utils/googleAuth';
import { getClient, getCurrentModel } from '@/utils/openai';
import { getPrompt, renderTemplate } from '@/utils/prompts';

export async function POST(request: Request) {
  try {
    const { channelId } = await request.json();
    if (!channelId) {
      return NextResponse.json({ error: 'channelId required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Get channel record
    const { data: channelRecord, error: channelError } = await supabase
      .from('channels')
      .select('id, title, subscriber_count, video_count, view_count')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .single();

    if (channelError || !channelRecord) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Get user's answers
    const { data: answers } = await supabase
      .from('channel_questions')
      .select('question, answer')
      .eq('channel_id', channelRecord.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    // Get channel context (about, recent titles)
    const { data: context } = await supabase
      .from('neria_context')
      .select('prompt_type, prompt_text')
      .eq('channel_id', channelRecord.id);

    const aboutText = context?.find(c => c.prompt_type === 'channel_about')?.prompt_text || '';
    let recentTitles: string[] = [];
    try {
      const titlesRaw = context?.find(c => c.prompt_type === 'recent_video_titles')?.prompt_text;
      if (titlesRaw) recentTitles = JSON.parse(titlesRaw);
    } catch {}

    // Get YouTube Analytics data (last 3-6 months)
    const tokenResult = await getValidAccessToken(user.id);
    if (!tokenResult.success) {
      return NextResponse.json({ error: 'No YouTube access' }, { status: 400 });
    }

    let analyticsData: any = {};
    try {
      // Get channel analytics for last 6 months
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const analyticsRes = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}&startDate=${startDate}&endDate=${endDate}&metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained&dimensions=day`,
        {
          headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
        }
      );

      if (analyticsRes.ok) {
        analyticsData = await analyticsRes.json();
      }

      // Get top videos from last 3 months
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&publishedAfter=${threeMonthsAgo}&order=viewCount&maxResults=10&type=video`,
        {
          headers: { Authorization: `Bearer ${tokenResult.accessToken}` }
        }
      );

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        analyticsData.topVideos = searchData.items || [];
      }
    } catch (e) {
      console.warn('Failed to fetch analytics:', e);
    }

    // Generate strategy with OpenAI
    // Use OpenAI GPT-4o for strategy generation (reliable and proven)
    const modelConfig = { provider: "openai", model: "gpt-4o" };
    const client = getClient(modelConfig.provider);
    const tpl = await getPrompt('strategy_generation');
    const strategyPrompt = renderTemplate(tpl, {
      channel_title: channelRecord.title,
      stats_line: `${channelRecord.subscriber_count?.toLocaleString()} subscribers, ${channelRecord.video_count} videos, ${channelRecord.view_count?.toLocaleString()} views`,
      about_text: aboutText || 'Not provided',
      recent_titles: recentTitles.slice(0, 5).join(', ') || 'None available',
      answers_block: (answers || []).map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n'),
      analytics_summary: JSON.stringify(analyticsData).slice(0, 1000),
    });

    const completion = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: strategyPrompt },
        { role: 'user', content: 'Generate the strategy now.' }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const strategy = completion.choices?.[0]?.message?.content || 'Unable to generate strategy at this time.';

    // Persist strategy plan
    try {
      await supabase
        .from('channel_strategy')
        .upsert({
          user_id: user.id,
          channel_id: channelRecord.id,
          plan_text: strategy,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,channel_id' });
    } catch {}

    // Extract and persist user goals, preferences, and constraints from answers
    try {
      const goalsAnswer = (answers || []).find(a => 
        a.question && a.question.toLowerCase().includes('goals') || 
        a.question && a.question.toLowerCase().includes('primary goals')
      )?.answer || '';
      
      const timeAnswer = (answers || []).find(a => 
        a.question && a.question.toLowerCase().includes('time') || 
        a.question && a.question.toLowerCase().includes('commit')
      )?.answer || '';
      
      const aboutAnswer = (answers || []).find(a => 
        a.question && a.question.toLowerCase().includes('about') || 
        a.question && a.question.toLowerCase().includes('channel is about')
      )?.answer || '';

      // Build structured goals and preferences from the answers
      const goals = goalsAnswer ? `Goals: ${goalsAnswer}` : '';
      const preferences = aboutAnswer ? `Channel Focus: ${aboutAnswer}` : '';
      const constraints = timeAnswer ? `Time Commitment: ${timeAnswer}` : '';

      // Create or update memory profile only if we have some information
      if (goals || preferences || constraints) {
        await supabase
          .from('memory_profile')
          .upsert({
            user_id: user.id,
            channel_id: channelRecord.id,
            goals,
            preferences,
            constraints,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,channel_id' });
      }
    } catch (e) {
      console.warn('Failed to create memory profile:', e);
    }

    return NextResponse.json({ strategy });
  } catch (e: any) {
    console.error('Strategy generation error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}



