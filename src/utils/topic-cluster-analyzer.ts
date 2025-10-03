export type VideoForClustering = {
  id: string;
  title: string;
  description: string;
  publishedAt?: string;
  durationSec?: number;
};

export type ClusterBucket = {
  key: string;
  label: string;
  description: string;
  examples?: string[];
};

export type ClusterAssignment = {
  videoId: string;
  bucketKey: string;
  confidence?: number;
  rationale?: string;
};

export type GeminiClusterResponse = {
  buckets: ClusterBucket[];
  assignments: ClusterAssignment[];
  notes?: string;
};

export type GeminiClusterResult = {
  data: GeminiClusterResponse & { rawText: string };
  tokenUsage: number | null;
};

const GEMINI_MODEL_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

function normalizeGeminiJson(raw: string): string {
  let text = String(raw || '').trim();
  if (!text) return '';
  text = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

function sanitizeBuckets(buckets: ClusterBucket[] = []): ClusterBucket[] {
  const seen = new Set<string>();
  return buckets
    .map((bucket, idx) => {
      const key = bucket.key?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `bucket_${idx + 1}`;
      const uniqueKey = (() => {
        let candidate = key || `bucket_${idx + 1}`;
        let counter = 1;
        while (seen.has(candidate)) {
          candidate = `${key || 'bucket'}_${counter++}`;
        }
        return candidate;
      })();
      seen.add(uniqueKey);
      return {
        key: uniqueKey,
        label: bucket.label?.trim() || `Bucket ${idx + 1}`,
        description: bucket.description?.trim() || '',
        examples: bucket.examples,
      };
    });
}

async function callGeminiEndpoint(payload: unknown) {
  const res = await fetch(`${GEMINI_MODEL_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function generateTopicClustersWithGemini(videos: VideoForClustering[]): Promise<GeminiClusterResult>
{
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  if (videos.length === 0) {
    return { buckets: [], assignments: [], notes: 'No videos supplied', rawText: '' };
  }

  const trimmedVideos = videos.map((video) => ({
    id: video.id,
    title: video.title,
    description: (video.description || '').slice(0, 160),
    publishedAt: video.publishedAt,
    durationSec: video.durationSec,
  }));
  const sampledVideos = trimmedVideos.slice(0, Math.min(trimmedVideos.length, 40)).map((video) => ({
    ...video,
    title: video.title.replace(/[\n\r\t"\\]+/g, ' ').slice(0, 100),
    description: video.description.replace(/[\n\r\t"\\]+/g, ' ').slice(0, 80),
  }));

  const instructions = `Classify ALL ${sampledVideos.length} YouTube videos into content buckets.

BUCKET RULES:
- Create MINIMUM 1 bucket, MAXIMUM 5 buckets
- If all videos are very similar content, use only 1 bucket
- Only create multiple buckets if there are genuinely distinct content themes
- Prefer fewer, broader buckets over many narrow ones
- AVOID redundant buckets: If two themes overlap significantly (e.g., "Industry Commentary" vs "Industry Commentary & Reviews"), combine them into ONE bucket with the broader label
- Each bucket must be clearly distinct from the others

Return valid JSON: {"buckets": [{"key": "snake_case", "label": "Name", "description": "brief"}], "assignments": [{"videoId": "id", "bucketKey": "key", "confidence": 0.0-1.0}]}.
CRITICAL: Create exactly ${sampledVideos.length} assignments - one for EVERY video. No video can be skipped.`;

  const requestPayload = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: instructions }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Classify the following videos into coherent buckets. Each entry includes id, title, description (trimmed), publish date, and duration seconds:
${JSON.stringify(sampledVideos)}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      topK: 32,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  } as const;

  let rawText = '';
  const responseJson = await callGeminiEndpoint(requestPayload);
  const primaryCandidate = responseJson?.candidates?.[0];
  let jsonPayload: unknown = null;
  if (primaryCandidate?.content?.parts && Array.isArray(primaryCandidate.content.parts)) {
    const pieces: string[] = [];
    for (const part of primaryCandidate.content.parts) {
      if (!part) continue;
      if (jsonPayload == null && part.jsonValue) {
        jsonPayload = part.jsonValue;
      }
      if (typeof part.text === 'string' && part.text.trim().length > 0) {
        pieces.push(part.text.trim());
        continue;
      }
      if (part.jsonValue) {
        try {
          pieces.push(JSON.stringify(part.jsonValue));
        } catch {
          // ignore JSON stringify error
        }
        continue;
      }
      if (part.functionCall?.args) {
        try {
          pieces.push(JSON.stringify(part.functionCall.args));
        } catch {
          // ignore
        }
      }
    }
    rawText = pieces.join('\n');
  }

  if (!rawText && !jsonPayload) {
    const blockReason = responseJson?.promptFeedback?.blockReason || primaryCandidate?.finishReason;
    if (blockReason) {
      throw new Error(`Gemini blocked the response: ${blockReason}`);
    }
    throw new Error('Gemini returned empty response');
  }

  let parsed: GeminiClusterResponse;
  try {
    if (jsonPayload && typeof jsonPayload === 'object') {
      parsed = jsonPayload as GeminiClusterResponse;
    } else {
      const normalized = normalizeGeminiJson(rawText);
      if (!normalized) {
        throw new Error('Empty normalized response');
      }
      parsed = JSON.parse(normalized);
    }
  } catch (error) {
    const sample = rawText ? `${rawText.slice(0, 200)}${rawText.length > 200 ? '…' : ''}` : '<<empty>>';
    console.error('[Topic Buckets] Gemini candidate parts', JSON.stringify(primaryCandidate?.content?.parts ?? [], null, 2));
    throw new Error(`Failed to parse Gemini response: ${(error as Error).message}. Sample: ${sample}`);
  }

  let buckets = sanitizeBuckets(parsed.buckets);
  
  // Enforce maximum of 5 buckets
  if (buckets.length > 5) {
    console.log(`[Bucket Classifier] Gemini created ${buckets.length} buckets, limiting to 5`);
    buckets = buckets.slice(0, 5);
  }
  
  const assignments = (parsed.assignments || []).filter((assignment) =>
    assignment.videoId && assignment.bucketKey
  ).map((assignment) => ({
    videoId: assignment.videoId,
    bucketKey: assignment.bucketKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, ''),
    confidence: assignment.confidence,
    rationale: assignment.rationale,
  }));

  // Ensure assignments use existing bucket keys (after potential bucket limiting)
  const validKeys = new Set(buckets.map((bucket) => bucket.key));
  const normalizedAssignments = assignments.map((assignment) => {
    if (!validKeys.has(assignment.bucketKey)) {
      // If assignment references a bucket that was removed, assign to first available bucket
      const fallback = buckets[0]?.key || 'bucket_1';
      console.log(`[Bucket Classifier] Reassigning video ${assignment.videoId} from removed bucket to ${fallback}`);
      return { ...assignment, bucketKey: fallback };
    }
    return assignment;
  });

  // Ensure EVERY video has an assignment
  const assignedVideoIds = new Set(normalizedAssignments.map(a => a.videoId));
  const missingAssignments = sampledVideos
    .filter(v => !assignedVideoIds.has(v.id))
    .map(v => ({
      videoId: v.id,
      bucketKey: buckets[0]?.key || 'bucket_1',
      confidence: 0.5,
      rationale: 'Auto-assigned to default bucket'
    }));
  
  const finalAssignments = [...normalizedAssignments, ...missingAssignments];

  const tokenUsage = typeof responseJson?.usageMetadata?.totalTokenCount === 'number'
    ? Number(responseJson.usageMetadata.totalTokenCount)
    : null;

  return {
    data: { buckets, assignments: finalAssignments, notes: parsed.notes, rawText },
    tokenUsage,
  };
}
