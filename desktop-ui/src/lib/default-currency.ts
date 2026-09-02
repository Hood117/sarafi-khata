import type { CurrencyListItem } from "@desktop/api";

/** Shop default currency code (Afghani). Soft-accepts legacy "AF". */
export const DEFAULT_CURRENCY_CODE = "AFN";

/** Prefer AF / AFN (Afghani) from a loaded currency list; otherwise first item or AFN. */
export function pickDefaultCurrency(
  items: Array<Pick<CurrencyListItem, "code">> | null | undefined,
  fallback: string = DEFAULT_CURRENCY_CODE,
): string {
  const list = items ?? [];
  const preferred = list.find((c) => {
    const code = c.code.trim().toUpperCase();
    return code === "AF" || code === "AFN";
  });
  return preferred?.code ?? list[0]?.code ?? fallback;
}

/** Second currency for exchange pairs (not the same as the default). */
export function pickSecondaryCurrency(
  items: Array<Pick<CurrencyListItem, "code">> | null | undefined,
  primary: string,
  fallback = "USD",
): string {
  const list = items ?? [];
  const primaryU = primary.trim().toUpperCase();
  const other = list.find((c) => c.code.trim().toUpperCase() !== primaryU);
  return other?.code ?? fallback;
}
