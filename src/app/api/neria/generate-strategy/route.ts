import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { getValidAccessToken } from '@/utils/googleAuth';
import OpenAI from 'openai';

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  return new OpenAI({ apiKey });
}

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
    const openai = getOpenAI();
    const strategyPrompt = `You are Neria, a YouTube strategy coach. Based on the user's goals and channel analytics, create a concise strategy.

Channel: ${channelRecord.title}
Stats: ${channelRecord.subscriber_count?.toLocaleString()} subscribers, ${channelRecord.video_count} videos, ${channelRecord.view_count?.toLocaleString()} views

User's About: ${aboutText || 'Not provided'}
Recent Video Titles: ${recentTitles.slice(0, 5).join(', ') || 'None available'}

User's Answers:
${(answers || []).map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}

Analytics Summary: ${JSON.stringify(analyticsData).slice(0, 1000)}

IMPORTANT: Write a SHORT strategy with EXACTLY 6 sentences or less. Cover the most important recommendations for content type, upload frequency, and one key improvement. Be concise and actionable. End with: "Do you agree with this plan?"`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: strategyPrompt },
        { role: 'user', content: 'Generate the strategy now.' }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const strategy = completion.choices?.[0]?.message?.content || 'Unable to generate strategy at this time.';

    return NextResponse.json({ strategy });
  } catch (e: any) {
    console.error('Strategy generation error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}



