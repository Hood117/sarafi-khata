import type { AppLocale } from "@/lib/i18n/locale";

/** Localized currency names + preferred symbols for desk UI. */
const CURRENCY_I18N: Record<
  string,
  { en: string; fa: string; ps: string; symbol: string }
> = {
  AFN: { en: "Afghani", fa: "افغانی", ps: "افغانۍ", symbol: "؋" },
  PKR: { en: "Pakistani Rupee", fa: "روپیه پاکستان", ps: "پاکستانۍ کلداره", symbol: "Rs" },
  IRR: { en: "Iranian Rial", fa: "ریال ایران", ps: "ایراني ریال", symbol: "Rl" },
  INR: { en: "Indian Rupee", fa: "روپیه هند", ps: "هندي کلداره", symbol: "₹" },
  TRY: { en: "Turkish Lira", fa: "لیره ترکیه", ps: "ترکي لیره", symbol: "₺" },
  SAR: { en: "Saudi Riyal", fa: "ریال سعودی", ps: "سعودي ریال", symbol: "SR" },
  AED: { en: "UAE Dirham", fa: "درهم امارات", ps: "اماراتي درهم", symbol: "Dh" },
  QAR: { en: "Qatari Riyal", fa: "ریال قطر", ps: "قطري ریال", symbol: "QR" },
  OMR: { en: "Omani Rial", fa: "ریال عمان", ps: "عماني ریال", symbol: "OR" },
  KWD: { en: "Kuwaiti Dinar", fa: "دینار کویت", ps: "کويتي دينار", symbol: "KD" },
  USD: { en: "US Dollar", fa: "دالر آمریکا", ps: "امریکایي ډالر", symbol: "$" },
  EUR: { en: "Euro", fa: "یورو", ps: "یورو", symbol: "€" },
  GBP: { en: "British Pound", fa: "پوند انگلیس", ps: "برتاني پونډ", symbol: "£" },
  CHF: { en: "Swiss Franc", fa: "فرانک سویس", ps: "سویسي فرانک", symbol: "CHF" },
  JPY: { en: "Japanese Yen", fa: "ین جاپان", ps: "جاپاني ین", symbol: "¥" },
  CNY: { en: "Chinese Yuan", fa: "یوان چین", ps: "چینایي یوان", symbol: "¥" },
  CAD: { en: "Canadian Dollar", fa: "دالر کانادا", ps: "کاناډایي ډالر", symbol: "C$" },
  AUD: { en: "Australian Dollar", fa: "دالر استرالیا", ps: "آسټرالیایي ډالر", symbol: "A$" },
  RUB: { en: "Russian Ruble", fa: "روبل روسیه", ps: "روسي روبل", symbol: "₽" },
  SGD: { en: "Singapore Dollar", fa: "دالر سنگاپور", ps: "سنګاپوري ډالر", symbol: "S$" },
  MYR: { en: "Malaysian Ringgit", fa: "رینگیت مالیزیا", ps: "مالیزیایي رینګټ", symbol: "RM" },
};

export { currencyFlagSrc } from "@desktop/lib/currency-flags";

export type CurrencyLabelInput = {
  code: string;
  name?: string | null;
  symbol?: string | null;
};

export function localizedCurrencyName(
  code: string,
  locale: AppLocale,
  fallbackName?: string | null,
): string {
  const row = CURRENCY_I18N[code.toUpperCase()];
  if (row) {
    if (locale === "fa") return row.fa;
    if (locale === "ps") return row.ps;
    return row.en;
  }
  return (fallbackName ?? "").trim() || code.toUpperCase();
}

export function currencyDisplaySymbol(
  code: string,
  fallbackSymbol?: string | null,
): string {
  const row = CURRENCY_I18N[code.toUpperCase()];
  const preferred = row?.symbol;
  const fallback = (fallbackSymbol ?? "").trim();
  return preferred || fallback;
}

/** e.g. `AFN — افغانی (؋)` */
export function formatCurrencyLabel(
  c: CurrencyLabelInput,
  locale: AppLocale,
): string {
  const code = c.code.toUpperCase();
  const name = localizedCurrencyName(code, locale, c.name);
  const sym = currencyDisplaySymbol(code, c.symbol);
  return sym ? `${code} — ${name} (${sym})` : `${code} — ${name}`;
}

export function currencySearchHaystack(
  c: CurrencyLabelInput,
  locale: AppLocale,
): string {
  const code = c.code.toUpperCase();
  const row = CURRENCY_I18N[code];
  const parts = [
    code,
    c.name,
    c.symbol,
    row?.en,
    row?.fa,
    row?.ps,
    row?.symbol,
    localizedCurrencyName(code, locale, c.name),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** CSS class for signed money amounts: in=green, out=red. */
export function moneyToneClass(amount: number | string | null | undefined): string {
  const n =
    typeof amount === "number"
      ? amount
      : Number.parseFloat(
          String(amount ?? "")
            .replace(/,/g, "")
            .replace(/−/g, "-"),
        );
  if (!Number.isFinite(n) || n === 0) return "money-neutral";
  return n > 0 ? "money-in" : "money-out";
}
