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
    const { channelId, currentPlan, userFeedback } = await request.json();
    if (!channelId || !currentPlan || !userFeedback) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Check if user agrees (simple keyword matching)
    const agreementKeywords = ['yes', 'agree', 'sounds good', 'perfect', 'looks good', 'fine', 'ok', 'okay'];
    const userAgrees = agreementKeywords.some(keyword => 
      userFeedback.toLowerCase().includes(keyword)
    );

    if (userAgrees && userFeedback.length < 50) {
      // User agrees with minimal feedback - we're done
      return NextResponse.json({ 
        status: 'complete',
        message: 'Perfect! Your strategy is now ready to implement. Success!'
      });
    }

    // Generate refined plan
    const openai = getOpenAI();
    const refinementPrompt = `You are Neria. The user has provided feedback on your strategy plan.

Current Plan:
${currentPlan}

User Feedback:
${userFeedback}

Based on their feedback, adjust the strategy and respond as Neria. Keep the same structure but incorporate their suggestions. End with "Does this updated plan work better for you?"

If they seem to fully agree, respond with exactly: "SUCCESS"`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: refinementPrompt },
        { role: 'user', content: 'Refine the plan based on the feedback.' }
      ],
      max_tokens: 1200,
      temperature: 0.7,
    });

    const refinedPlan = completion.choices?.[0]?.message?.content || 'Unable to refine plan at this time.';

    if (refinedPlan.trim().toUpperCase() === 'SUCCESS') {
      return NextResponse.json({ 
        status: 'complete',
        message: 'Perfect! Your strategy is now ready to implement. Success!'
      });
    }

    // Persist refined plan draft
    try {
      // Resolve channel UUID
      const { data: ch } = await supabase
        .from('channels')
        .select('id')
        .eq('user_id', user.id)
        .eq('channel_id', channelId)
        .maybeSingle();
      if (ch?.id) {
        await supabase
          .from('channel_strategy')
          .upsert({ user_id: user.id, channel_id: ch.id, plan_text: refinedPlan, updated_at: new Date().toISOString() }, { onConflict: 'user_id,channel_id' });
      }
    } catch {}

    return NextResponse.json({ 
      status: 'continue',
      refinedPlan 
    });
  } catch (e: any) {
    console.error('Plan refinement error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}



