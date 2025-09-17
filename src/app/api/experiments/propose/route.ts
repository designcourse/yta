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

    // Seed lever from deterministic verdicts and goal weights
    const v = kpisBundle?.verdicts || null;
    let seed: 'ctr' | 'retention' | 'topic' | 'format' | undefined;
    if (v) {
      if (v.ctr_24h === 'fail') seed = 'ctr';
      else if (v.avd_24h === 'fail' || v.retention_pct === 'fail') seed = 'retention';
      else if (v.vpd_24h === 'fail') seed = 'topic';
    }
    // If no clear fail, nudge selection by user weights (growth favors CTR/retention/vpd; shorts favors CTR/retention for shorts)
    try {
      const g = kpisBundle?.goals || null;
      const dims = kpisBundle?.comparable?.dims || null;
      if (!seed && g) {
        const isShort = (dims?.format === 'short');
        const weighted: Array<{ lever: 'ctr'|'retention'|'topic'|'format'; score: number }> = [
          { lever: 'ctr', score: (g.growth ?? 0.4) + (isShort ? (g.shorts ?? 0.1) : 0) },
          { lever: 'retention', score: (g.growth ?? 0.4) + (isShort ? (g.shorts ?? 0.1) : 0) },
          { lever: 'topic', score: (g.growth ?? 0.4) * 0.8 },
          { lever: 'format', score: (g.shorts ?? 0.1) * 0.9 },
        ];
        weighted.sort((a,b) => b.score - a.score);
        seed = weighted[0].lever;
      }
    } catch {}
    // Try LLM; fallback to deterministic
    const proposal = await proposeNextExperimentLLM(kpisBundle, seed).catch(() => proposeNextExperiment(kpisBundle));
    return NextResponse.json({ proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


