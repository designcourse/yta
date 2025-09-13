import { NeriaInput, NeriaOutput, ZNeriaOutput } from '@/utils/types/neria';

// Minimal REST client for Gemini 2.5 Flash text generation
async function callGemini25FlashText(systemPrompt: string, userJson: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  // Use Gemini 2.5 Pro for better performance
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

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
  const systemPrompt = `You are Neria, a YouTube mentor. Analyze the provided channel data and return ONLY valid JSON.

CRITICAL: Do NOT mention impressions, CTR, or advertising metrics. Focus on views, retention, duration, subscribers.

Return EXACTLY this JSON structure (replace content but keep exact format):

{
  "slides": [
    {
      "id": 1,
      "headline": "Upload Consistency Analysis",
      "body": "Analyze upload frequency and recent activity patterns.",
      "keyStats": [
        {"label": "Uploads (90d)", "value": "35"},
        {"label": "Avg Retention", "value": "9.39%"}
      ],
      "actions": [
        "Improve video hooks in first 15 seconds",
        "Test shorter intro segments",
        "Add clear value promise early"
      ],
      "confidence": 0.8
    },
    {
      "id": 2,
      "headline": "Retention Performance",
      "body": "Focus on viewer retention and engagement patterns.",
      "keyStats": [
        {"label": "View Duration", "value": "200s"},
        {"label": "Total Views", "value": "851k"}
      ],
      "actions": [
        "Optimize content pacing",
        "Strengthen opening hooks",
        "Test different content formats"
      ],
      "confidence": 0.8
    },
    {
      "id": 3,
      "headline": "Growth Strategy",
      "body": "Recommendations for channel optimization.",
      "keyStats": [
        {"label": "Subscriber Growth", "value": "+10.4k net"}
      ],
      "actions": [
        "Maintain consistent upload schedule",
        "Focus on retention optimization",
        "Experiment with content variety"
      ],
      "confidence": 0.8
    }
  ],
  "tags": ["consistency", "retention", "growth"],
  "upgradeHook": "Unlock detailed retention heatmaps and competitor benchmarks."
}`;

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
    console.error('[Gemini Analyzer] Validation errors:', JSON.stringify(validated.error.issues, null, 2));
    console.error('[Gemini Analyzer] Raw parsed object:', JSON.stringify(parsed, null, 2));
    throw new Error('Gemini analyzer output failed validation');
  }
  return validated.data;
}


