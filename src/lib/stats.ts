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

export function sum(xs: number[]): number {
  return xs.filter((x) => Number.isFinite(x)).reduce((a, b) => a + b, 0);
}
