/**
 * Shared currency display helpers (code + optional symbol).
 * Arabic-script symbols (؋, د.إ, ﷼, …) are shown only for Dari/Pashto UI.
 */

import type { AppLocale } from "@/lib/i18n/locale";

/** Perso-Arabic / Arabic script ranges used by AFN, AED, SAR, etc. */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function hasArabicScriptCurrencySymbol(symbol: string): boolean {
  return ARABIC_SCRIPT_RE.test(symbol);
}

/**
 * Returns a symbol safe for the active UI language.
 * Arabic-script signs (؋, د.إ, …) only appear for Dari/Pashto.
 */
export function resolveCurrencySymbolForDisplay(
  symbol: string | null | undefined,
  locale: AppLocale = "en",
): string | null {
  const trimmed = symbol?.trim();
  if (!trimmed) {
    return null;
  }
  if (
    hasArabicScriptCurrencySymbol(trimmed) &&
    locale !== "fa" &&
    locale !== "ps"
  ) {
    return null;
  }
  return trimmed;
}

export function formatCurrencyLabel(input: {
  code: string;
  symbol?: string | null;
  locale?: AppLocale;
}): string {
  const code = input.code.trim();
  const symbol = resolveCurrencySymbolForDisplay(
    input.symbol,
    input.locale ?? "en",
  );
  if (!code) {
    return "—";
  }
  return symbol ? `${code} (${symbol})` : code;
}

export function formatMoneyWithCurrency(input: {
  code: string;
  symbol?: string | null;
  amountDisplay: string;
  locale?: AppLocale;
}): string {
  const amount = input.amountDisplay.trim();
  const code = input.code.trim();
  const symbol = resolveCurrencySymbolForDisplay(
    input.symbol,
    input.locale ?? "en",
  );

  if (!amount || amount === "—") {
    return formatCurrencyLabel({
      code,
      symbol: input.symbol,
      locale: input.locale,
    });
  }

  if (symbol) {
    return `${symbol}${amount} ${code}`;
  }

  return `${amount} ${code}`;
}
