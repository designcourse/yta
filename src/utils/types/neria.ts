import { z } from 'zod';

export type NeriaInput = {
  channel: {
    id: string;
    title: string;
    createdAt: string;
    ageDays: number;
    country: string | null;
    subscribers: number;
    videoCount: number;
    lastUploadDaysAgo: number | null;
    nicheGuess: string | null;
  };
  recentUploads: Array<{
    id: string;
    title: string;
    publishedAt: string;
    durationSec: number;
    isShort: boolean;
    views: number;
    impressions: number;
    ctr: number | null;
    avgViewDurationSec: number | null;
    avgViewPct: number | null;
    comments: number;
    likes: number;
  }>;
  rollups: {
    period: { start: string; end: string; days: number };
    counts: { uploads: number; shorts: number; longForm: number };
    metrics: {
      views: number;
      watchTimeHours: number;
      avgViewDurationSec: number | null;
      avgViewPct: number | null;
      impressions: number;
      ctr: number | null;
      subsNet: number;
    };
  };
  cadence: { per30d: number; per90d: number };
  titleSamples: string[];
  benchmarks?: {
    niche?: string;
    channelSizeBucket?: string;
    ctrHealthyRangePct?: [number, number];
    avgRetentionPctHealthy?: [number, number];
    uploadsPerMonthSuggested?: [number, number];
    notes?: string;
  };
  dataGaps: string[];
};

export type NeriaOutput = {
  slides: Array<{
    id: 1 | 2 | 3;
    headline: string;
    body: string;
    keyStats: Array<{ label: string; value: string; note?: string }>;
    actions: string[];
    confidence: number;
  }>;
  tags: string[];
  upgradeHook: string;
};

export const ZNeriaInput: z.ZodType<NeriaInput> = z.object({
  channel: z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.string(),
    ageDays: z.number(),
    country: z.string().nullable(),
    subscribers: z.number(),
    videoCount: z.number(),
    lastUploadDaysAgo: z.number().nullable(),
    nicheGuess: z.string().nullable(),
  }),
  recentUploads: z.array(z.object({
    id: z.string(),
    title: z.string(),
    publishedAt: z.string(),
    durationSec: z.number(),
    isShort: z.boolean(),
    views: z.number(),
    impressions: z.number(),
    ctr: z.number().nullable(),
    avgViewDurationSec: z.number().nullable(),
    avgViewPct: z.number().nullable(),
    comments: z.number(),
    likes: z.number(),
  })),
  rollups: z.object({
    period: z.object({ start: z.string(), end: z.string(), days: z.number() }),
    counts: z.object({ uploads: z.number(), shorts: z.number(), longForm: z.number() }),
    metrics: z.object({
      views: z.number(),
      watchTimeHours: z.number(),
      avgViewDurationSec: z.number().nullable(),
      avgViewPct: z.number().nullable(),
      impressions: z.number(),
      ctr: z.number().nullable(),
      subsNet: z.number(),
    }),
  }),
  cadence: z.object({ per30d: z.number(), per90d: z.number() }),
  titleSamples: z.array(z.string()),
  benchmarks: z.object({
    niche: z.string().optional(),
    channelSizeBucket: z.string().optional(),
    ctrHealthyRangePct: z.tuple([z.number(), z.number()]).optional(),
    avgRetentionPctHealthy: z.tuple([z.number(), z.number()]).optional(),
    uploadsPerMonthSuggested: z.tuple([z.number(), z.number()]).optional(),
    notes: z.string().optional(),
  }).optional(),
  dataGaps: z.array(z.string()),
});

export const ZNeriaOutput: z.ZodType<NeriaOutput> = z.object({
  slides: z.array(z.object({
    id: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    headline: z.string(),
    body: z.string(),
    keyStats: z.array(z.object({ label: z.string(), value: z.string(), note: z.string().optional() })),
    actions: z.array(z.string()),
    confidence: z.number(),
  })).length(3),
  tags: z.array(z.string()),
  upgradeHook: z.string(),
});

export function asShort(durationSec: number): boolean {
  return Number(durationSec || 0) < 61;
}

export function fmtNumber(n: number): string {
  const value = Number(n || 0);
  if (value < 1000) return new Intl.NumberFormat().format(value);
  if (value < 100000) {
    const v = value / 1000;
    const s = v.toFixed(1);
    return `${s.endsWith('.0') ? s.slice(0, -2) : s}k`;
  }
  if (value < 1000000) {
    const v = Math.floor(value / 1000);
    return `${v}k`;
  }
  const m = value / 1000000;
  const ms = m.toFixed(1);
  return `${ms.endsWith('.0') ? ms.slice(0, -2) : ms}M`;
}

export function daysAgo(iso: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(diff / (24 * 3600 * 1000)));
}


