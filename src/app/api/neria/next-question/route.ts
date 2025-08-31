import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
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

    // Find channel record by YouTube channelId and user
    const { data: channelRecord, error: channelError } = await supabase
      .from('channels')
      .select('id, title')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .single();

    if (channelError || !channelRecord) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Load prior answers for this channel
    const { data: qaRows, error: qaError } = await supabase
      .from('channel_questions')
      .select('question, answer')
      .eq('channel_id', channelRecord.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (qaError) {
      return NextResponse.json({ error: 'Failed to load answers' }, { status: 500 });
    }

    const answers = (qaRows || []).filter(r => r.answer && r.answer.trim().length > 0);

    // Pull optional context captured earlier
    const { data: ctxRows } = await supabase
      .from('neria_context')
      .select('prompt_type, prompt_text')
      .eq('channel_id', channelRecord.id);

    const aboutText = (ctxRows || []).find(r => r.prompt_type === 'channel_about')?.prompt_text || '';
    let recentTitles: string[] = [];
    try {
      const titlesRaw = (ctxRows || []).find(r => r.prompt_type === 'recent_video_titles')?.prompt_text;
      if (titlesRaw) recentTitles = JSON.parse(titlesRaw);
    } catch {}

    const requiredQuestions = [
      'In just a couple sentences, tell me what your channel is about.',
      "Roughly how much time per week can you commit to working on your channel?",
      'What are your primary goals for the next 3 months?',
    ];

    // Compose strict instruction
    const instruction = `You are Naria.\n\nYou need answers to the following questions. If you do not know the answer to these questions, choose which answer is the most important to have answered first, and return a response with the question that you chose.\n\nIf you reach a point where you understand all of these questions, return a response with the number '200'.\n\nAsk these in natural language, as if speaking to the user:\n- In just a couple sentences, tell me what your channel is about.\n- Roughly how much time per week can you commit to working on your channel?\n- What are your primary goals for the next 3 months?\n\nRules:\n- If you can infer an answer from Context, skip that question.\n- Respond with ONLY one of: a single question string (no quotes, no extraneous text), or exactly 200.\n- Do not include explanations or any other text.`;

    // Provide context of known answers
    const context = {
      channelTitle: channelRecord.title,
      channelAbout: aboutText,
      recentVideoTitles: recentTitles,
      knownAnswers: answers,
      requiredQuestions,
    };

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: `Known answers (JSON):\n${JSON.stringify(context, null, 2)}` },
      ],
      max_tokens: 100,
      temperature: 0,
    });

    const raw = (completion.choices?.[0]?.message?.content || '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 500 });
    }

    if (raw === '200') {
      return NextResponse.json({ status: 'done' });
    }

    return NextResponse.json({ status: 'question', question: raw });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


