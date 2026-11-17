export type ReviewStats = {
  sample_size: number;
  median_minutes: number | null;
  histogram: { start_minutes: number; count: number }[];
};

export const MIN_REVIEWS = 30;
export const MIN_COMPARISONS = 3;

export function playtimeEstimate(median: number, ratios: number[]) {
  const sorted = [...ratios].sort((a, b) => a - b);
  function quartile(fraction: number) {
    const index = (sorted.length - 1) * fraction;
    const lower = Math.floor(index);
    return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
  }
  return { low: median * quartile(0.25), high: median * quartile(0.75) };
}
