import OpenAI from 'openai';
import { NeriaInput, NeriaOutput, ZNeriaOutput } from '@/utils/types/neria';
import { Quantiles } from '@/utils/baselines';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runNeriaAnalyzer(neriaInput: NeriaInput): Promise<NeriaOutput> {
  const systemPrompt = `You are Neria, an expert YouTube mentor. Your sole job is to quickly diagnose a channel's situation and propose a focused plan that makes the creator want to upgrade for deeper coaching. You will be given a single JSON payload named neriaInput that contains channel- and video-level stats. You must return a strictly valid JSON object named neriaOutput with exactly 3 slides. Be concise, specific, and immediately useful.

Hard Rules

Output JSON only—no markdown, no code fences, no extra text before/after.

Never invent numbers or facts. If data is missing, state that plainly and suggest how to unlock it.

Max 3 sentences per slide; one idea per sentence; no fluff or clichés.

Use concrete, imperative actions. Prefer numbers and ranges when available.

If the channel has no uploads, tailor all 3 slides to "first steps" and packaging strategy, and reference channel age appropriately ("older channel, no uploads" vs "brand new").

If last upload > 30 days, call out consistency; if > 90 days, call out dormancy.

Treat Shorts as videos with durationSec < 61; consider Shorts vs long-form balance in recommendations.

When comparing performance, use benchmarks if present. If not present, use directional language without precise comparisons.

Focus on available metrics: views, retention percentage, view duration, subscriber growth, upload consistency.

Do not mention impressions, CTR, or advertising metrics as these require different permissions.

Output Schema (return exactly this shape)
{
  "slides": [
    {
      "id": 1,
      "headline": "string (<=60 chars)",
      "body": "1-3 sentences, plain text.",
      "keyStats": [
        {"label":"Uploads (90d)","value":"35"},
        {"label":"Avg Retention","value":"9.39%"},
        {"label":"Views (90d)","value":"851k"}
      ],
      "actions": [
        "Actionable next step #1",
        "Actionable next step #2",
        "Actionable next step #3"
      ],
      "confidence": 0.0
    },
    {
      "id": 2,
      "headline": "string",
      "body": "1-3 sentences.",
      "keyStats": [],
      "actions": [],
      "confidence": 0.0
    },
    {
      "id": 3,
      "headline": "string",
      "body": "1-3 sentences.",
      "keyStats": [],
      "actions": [],
      "confidence": 0.0
    }
  ],
  "tags": ["consistency","packaging","retention"],
  "upgradeHook": "One sentence explaining what a paid analysis unlocks."
}

Remember: Return only the neriaOutput JSON.`;

  const userMessage = JSON.stringify(neriaInput);

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.6,
    max_tokens: 800,
  });

  const content = completion.choices?.[0]?.message?.content?.trim() || '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Analyzer returned invalid JSON');
  }
  const validated = ZNeriaOutput.safeParse(parsed);
  if (!validated.success) {
    throw new Error('Analyzer output failed validation');
  }
  return validated.data;
}

type KpisBundle = {
  videoId: string | null;
  comparable: { count: number; dims: { format: string | null; lengthBand: string | null; topicCluster: string | null }; confidence: 'low' | 'med' | 'high' } | null;
  baselines: { ctr_24h: Quantiles | null; avd_24h: Quantiles | null; vpd_24h: Quantiles | null; retention_pct: Quantiles | null } | null;
  current: { ctr_24h: number | null; avd_24h: number | null; vpd_24h: number | null; retention_pct: number | null } | null;
  verdicts: { ctr_24h: string; avd_24h: string; vpd_24h: string; retention_pct: string } | null;
};

export type ProposedExperiment = {
  lever: 'ctr' | 'retention' | 'topic' | 'format';
  hypothesis: string;
  steps: string[];
};

export async function proposeNextExperiment(kpis: KpisBundle): Promise<ProposedExperiment> {
  // Guardrails: pick one lever based on verdicts using deterministic logic first
  const v = kpis?.verdicts || null;
  let lever: ProposedExperiment['lever'] = 'ctr';
  if (v) {
    if (v.ctr_24h === 'fail') lever = 'ctr';
    else if (v.avd_24h === 'fail') lever = 'retention';
    else if (v.vpd_24h === 'fail') lever = 'topic';
    else if (v.retention_pct === 'fail') lever = 'retention';
    else {
      // No clear fails: pick neutral with biggest gap vs median if available
      lever = 'ctr';
    }
  }

  // Simple templated hypotheses to avoid fabricating metrics
  const hypothesis =
    lever === 'ctr'
      ? 'Improving title and thumbnail clarity will raise CTR without hurting retention.'
      : lever === 'retention'
      ? 'Tightening the first 30 seconds and adding mid-video rehooks will increase AVD.'
      : lever === 'topic'
      ? 'Targeting a tighter topic cluster aligned with recent winners will increase WTPI.'
      : 'Shifting length band to the comparable-set median will stabilize performance.';

  const steps: string[] =
    lever === 'ctr'
      ? [
          'Draft 3 alternative titles using curiosity + specificity.',
          'Design 2 thumbnail variants: one face-led, one object-led; max 4 words.',
          'Run a quick poll with 10 viewers or peers to pick the strongest set.'
        ]
      : lever === 'retention'
      ? [
          'Rewrite the first 2 sentences to promise a concrete outcome in 7 seconds.',
          'Insert a visual change or pattern break at 20–30 seconds.',
          'Add a mid-video checkpoint with a teaser for the payoff.'
        ]
      : lever === 'topic'
      ? [
          'List 5 subtopics closely related to the top-performing videos.',
          'Pick one with clear intent and create a tightly scoped script outline.',
          'Avoid format drift; keep packaging consistent with recent winners.'
        ]
      : [
          'Aim for the comparable-set median duration in your next upload.',
          'Remove filler segments; keep only novel or payoff-driving parts.',
          'Test one pacing pattern (e.g., faster cuts) and observe retention.'
        ];

  return { lever, hypothesis, steps };
}

export async function proposeNextExperimentLLM(kpis: KpisBundle, seedLever?: ProposedExperiment['lever']): Promise<ProposedExperiment> {
  const sys = `You are Neria, a YouTube coaching assistant. You are given KPIs, baselines, and verdicts for a single upload.
Hard rules: Do not invent numbers. Choose exactly ONE lever from [ctr, retention, topic, format]. If a preferred lever is provided, use it unless evidence strongly contradicts.
Return STRICT JSON only: {"lever":"ctr|retention|topic|format","hypothesis":"...","steps":["...", "..."]}. Keep steps concrete and non-numeric.`;
  const user = JSON.stringify({ kpis, preferredLever: seedLever || null });
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    max_tokens: 300,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ]
  });
  const content = completion.choices?.[0]?.message?.content?.trim() || '';
  try {
    const parsed = JSON.parse(content);
    const lever = parsed?.lever as ProposedExperiment['lever'];
    const hypothesis = String(parsed?.hypothesis || '').slice(0, 240);
    const steps = Array.isArray(parsed?.steps) ? parsed.steps.map((s: any) => String(s)).filter(Boolean).slice(0, 5) : [];
    const validLever = lever === 'ctr' || lever === 'retention' || lever === 'topic' || lever === 'format';
    if (!validLever || !hypothesis || steps.length === 0) throw new Error('invalid');
    return { lever, hypothesis, steps };
  } catch {
    // Fallback to deterministic template
    return proposeNextExperiment(kpis);
  }
}

