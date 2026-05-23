/** Population statistics helpers. Strings → numbers, NaN/null safe. */

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

export function mean(xs: number[]): number {
  const ys = xs.filter((x) => Number.isFinite(x));
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
}

export function stddev(xs: number[]): number {
  const ys = xs.filter((x) => Number.isFinite(x));
  if (ys.length < 2) return 0;
  const m = mean(ys);
  return Math.sqrt(ys.reduce((a, x) => a + (x - m) ** 2, 0) / (ys.length - 1));
}

export function median(xs: number[]): number {
  const ys = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!ys.length) return 0;
  const mid = Math.floor(ys.length / 2);
  return ys.length % 2 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
}

export function sum(xs: number[]): number {
  return xs.filter((x) => Number.isFinite(x)).reduce((a, b) => a + b, 0);
}

export function zscore(x: number, xs: number[]): number {
  const s = stddev(xs);
  if (s === 0) return 0;
  return (x - mean(xs)) / s;
}

/** Simple linear regression; returns slope + intercept. */
export function linreg(points: [number, number][]): { slope: number; intercept: number } {
  if (points.length < 2) return { slope: 0, intercept: points[0]?.[1] ?? 0 };
  const n = points.length;
  const sx = sum(points.map((p) => p[0]));
  const sy = sum(points.map((p) => p[1]));
  const sxx = sum(points.map((p) => p[0] ** 2));
  const sxy = sum(points.map((p) => p[0] * p[1]));
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}
