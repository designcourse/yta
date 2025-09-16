export type ComparableDimensions = {
  videoFormat: 'short' | 'long';
  lengthBand?: string | null;
  topicCluster?: string | null;
};

export type Quantiles = {
  q1: number;
  median: number;
  q3: number;
  iqr: number;
};

export function determineLengthBand(lengthSec: number, isShort: boolean): string {
  if (isShort) return 'shorts';
  const min = 60;
  if (lengthSec < 6 * min) return '0-6m';
  if (lengthSec < 9 * min) return '6-9m';
  if (lengthSec < 13 * min) return '9-13m';
  if (lengthSec < 18 * min) return '13-18m';
  return '18m+';
}

export function computeQuantiles(values: number[]): Quantiles | null {
  const arr = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  const n = arr.length;
  if (n === 0) return null;
  const median = quantile(arr, 0.5);
  const q1 = quantile(arr, 0.25);
  const q3 = quantile(arr, 0.75);
  const iqr = q3 - q1;
  return { q1, median, q3, iqr };
}

function quantile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const h = idx - lo;
  return sorted[lo] * (1 - h) + sorted[hi] * h;
}

export function thresholdVerdict(value: number | null | undefined, quantiles: Quantiles | null): 'pass' | 'neutral' | 'fail' | 'unknown' {
  if (value == null || !Number.isFinite(value) || !quantiles) return 'unknown';
  const { median, iqr } = quantiles;
  const upper = median + 0.5 * iqr;
  const lower = median - 0.5 * iqr;
  if (value >= upper) return 'pass';
  if (value < lower) return 'fail';
  return 'neutral';
}

export function confidenceFromSampleSize(sampleSize: number): 'low' | 'med' | 'high' {
  if (sampleSize >= 15) return 'high';
  if (sampleSize >= 8) return 'med';
  return 'low';
}


