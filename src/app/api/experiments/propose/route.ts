import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { proposeNextExperiment, proposeNextExperimentLLM } from '@/utils/neria-openai';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { kpisBundle } = await request.json();
    if (!kpisBundle) return NextResponse.json({ error: 'kpisBundle required' }, { status: 400 });

    // Seed lever from deterministic verdicts
    const v = kpisBundle?.verdicts || null;
    let seed: 'ctr' | 'retention' | 'topic' | 'format' | undefined;
    if (v) {
      if (v.ctr_24h === 'fail') seed = 'ctr';
      else if (v.avd_24h === 'fail' || v.retention_pct === 'fail') seed = 'retention';
      else if (v.vpd_24h === 'fail') seed = 'topic';
    }
    // Try LLM; fallback to deterministic
    const proposal = await proposeNextExperimentLLM(kpisBundle, seed).catch(() => proposeNextExperiment(kpisBundle));
    return NextResponse.json({ proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


