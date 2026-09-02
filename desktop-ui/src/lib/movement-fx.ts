/** Shared FX helpers for deposit / withdraw / transfer forms. */

export type MovementRateBase = "left" | "right";

/** Convert left amount → right using rate. left×rate when base=left, else left÷rate. */
export function leftToRight(
  left: number,
  rate: number,
  rateBase: MovementRateBase,
): number | null {
  if (!Number.isFinite(left) || !Number.isFinite(rate) || left <= 0 || rate <= 0) {
    return null;
  }
  return rateBase === "left" ? left * rate : left / rate;
}

/** Convert right amount → left using rate. */
export function rightToLeft(
  right: number,
  rate: number,
  rateBase: MovementRateBase,
): number | null {
  if (!Number.isFinite(right) || !Number.isFinite(rate) || right <= 0 || rate <= 0) {
    return null;
  }
  return rateBase === "left" ? right / rate : right * rate;
}

export function formatFxAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const rounded = Math.round(n * 1e8) / 1e8;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return String(Math.round(rounded));
  }
  return String(rounded)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

export function currenciesDiffer(a: string, b: string): boolean {
  return a.trim().toUpperCase() !== b.trim().toUpperCase();
}
