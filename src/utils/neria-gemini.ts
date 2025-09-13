import { NeriaInput, NeriaOutput, ZNeriaOutput } from '@/utils/types/neria';

// Minimal REST client for Gemini 2.5 Flash text generation
async function callGemini25FlashText(systemPrompt: string, userJson: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  // Use Text-only 2.5 Flash endpoint
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  // Combine system prompt and user data into a single user message
  const combinedPrompt = `${systemPrompt}

Input data (neriaInput):
${userJson}

Remember: Output ONLY the JSON object. No explanations, no markdown formatting, just the raw JSON.`;

  const contents = [
    {
      role: 'user',
      parts: [{ text: combinedPrompt }],
    },
  ];

  console.log('[Gemini Analyzer] Calling Gemini 2.5 Flash with combined prompt length:', combinedPrompt.length);

  const res = await fetch(url + `?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 8192,  // Significantly increased to handle Gemini's internal thinking + JSON output
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini text error: ${res.status} ${txt}`);
  }
  const json = await res.json();
  console.log('[Gemini Analyzer] API response candidates:', json?.candidates?.length);
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || '';
  const out = String(text || '').trim();
  
  if (!out) {
    console.error('[Gemini Analyzer] Empty response from API. Full response:', JSON.stringify(json, null, 2));
    throw new Error('Gemini returned empty response');
  }
  // Strip code fences if present
  const fenced = out.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  // If still not pure JSON, try extracting the first {...} block
  if (fenced.startsWith('{') && fenced.endsWith('}')) return fenced;
  const firstBrace = fenced.indexOf('{');
  const lastBrace = fenced.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return fenced.slice(firstBrace, lastBrace + 1);
  }
  return fenced;
}

export async function runNeriaAnalyzerGemini(neriaInput: NeriaInput): Promise<NeriaOutput> {
  const systemPrompt = "You are Neria, an expert YouTube mentor. Your sole job is to quickly diagnose a channel’s situation and propose a focused plan that makes the creator want to upgrade for deeper coaching. You will be given a single JSON payload named neriaInput that contains channel- and video-level stats. You must return a strictly valid JSON object named neriaOutput with exactly 3 slides. Be concise, specific, and immediately useful.\n\nHard Rules\n\nOutput JSON only—no markdown, no code fences, no extra text before/after.\n\nNever invent numbers or facts. If data is missing, state that plainly and suggest how to unlock it.\n\nMax 3 sentences per slide; one idea per sentence; no fluff or clichés.\n\nUse concrete, imperative actions. Prefer numbers and ranges when available.\n\nIf the channel has no uploads, tailor all 3 slides to “first steps” and packaging strategy, and reference channel age appropriately (“older channel, no uploads” vs “brand new”).\n\nIf last upload > 30 days, call out consistency; if > 90 days, call out dormancy.\n\nTreat Shorts as videos with durationSec < 61; consider Shorts vs long-form balance in recommendations.\n\nWhen comparing performance, use benchmarks if present. If not present, use directional language without precise comparisons.\n\nExpected Input (provided separately as neriaInput)\n{\n  \"channel\": { ... },\n  \"recentUploads\": [ ... ],\n  \"rollups\": { ... },\n  \"cadence\": { ... },\n  \"titleSamples\": [ ... ],\n  \"benchmarks\": { ... },\n  \"dataGaps\": [ ... ]\n}\n\nOutput Schema (return exactly this shape)\n{\n  \"slides\": [\n    {\n      \"id\": 1,\n      \"headline\": \"string (<=60 chars)\",\n      \"body\": \"1-3 sentences, plain text.\",\n      \"keyStats\": [ {\"label\":\"Uploads (90d)\",\"value\":\"3\"} ],\n      \"actions\": [\n        \"Actionable next step #1\",\n        \"Actionable next step #2\",\n        \"Actionable next step #3\"\n      ],\n      \"confidence\": 0.0\n    },\n    { \"id\": 2, \"headline\": \"string\", \"body\": \"1-3 sentences.\", \"keyStats\": [], \"actions\": [], \"confidence\": 0.0 },\n    { \"id\": 3, \"headline\": \"string\", \"body\": \"1-3 sentences.\", \"keyStats\": [], \"actions\": [], \"confidence\": 0.0 }\n  ],\n  \"tags\": [\"consistency\",\"packaging\",\"retention\"],\n  \"upgradeHook\": \"One sentence explaining what a paid analysis unlocks.\"\n}\n\nRemember: Return only the neriaOutput JSON.";

  const userMessage = JSON.stringify(neriaInput);

  const raw = await callGemini25FlashText(systemPrompt, userMessage);
  console.log('[Gemini Analyzer] Raw response length:', raw.length);
  console.log('[Gemini Analyzer] Raw response preview:', raw.substring(0, 200));
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('[Gemini Analyzer] JSON parse error:', e);
    console.error('[Gemini Analyzer] Raw response:', raw);
    throw new Error('Gemini analyzer returned invalid JSON');
  }
  const validated = ZNeriaOutput.safeParse(parsed);
  if (!validated.success) {
    throw new Error('Gemini analyzer output failed validation');
  }
  return validated.data;
}


