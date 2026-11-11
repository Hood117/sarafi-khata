import type { AppLocale } from "@/lib/i18n/locale";
import { parseSignedAmountNumber } from "@desktop/lib/western-digits";

/** Localized currency names + preferred symbols for desk UI. */
const CURRENCY_I18N: Record<
  string,
  { en: string; fa: string; ps: string; symbol: string }
> = {
  AFN: { en: "Afghani", fa: "افغانی", ps: "افغانۍ", symbol: "؋" },
  AF: { en: "Afghani", fa: "افغانی", ps: "افغانۍ", symbol: "؋" },
  PKR: { en: "Pakistani Rupee", fa: "روپیه پاکستان", ps: "پاکستانۍ کلداره", symbol: "Rs" },
  IRR: { en: "Iranian Rial", fa: "ریال ایران", ps: "ایراني ریال", symbol: "Rl" },
  INR: { en: "Indian Rupee", fa: "روپیه هند", ps: "هندي کلداره", symbol: "₹" },
  TRY: { en: "Turkish Lira", fa: "لیره ترکیه", ps: "ترکي لیره", symbol: "₺" },
  SAR: { en: "Saudi Riyal", fa: "ریال سعودی", ps: "سعودي ریال", symbol: "SR" },
  AED: { en: "UAE Dirham", fa: "درهم امارات", ps: "اماراتي درهم", symbol: "Dh" },
  QAR: { en: "Qatari Riyal", fa: "ریال قطر", ps: "قطري ریال", symbol: "QR" },
  OMR: { en: "Omani Rial", fa: "ریال عمان", ps: "عماني ریال", symbol: "OR" },
  KWD: { en: "Kuwaiti Dinar", fa: "دینار کویت", ps: "کويتي دينار", symbol: "KD" },
  BHD: { en: "Bahraini Dinar", fa: "دینار بحرین", ps: "بحريني دينار", symbol: "BD" },
  JOD: { en: "Jordanian Dinar", fa: "دینار اردن", ps: "اردني دينار", symbol: "JD" },
  IQD: { en: "Iraqi Dinar", fa: "دینار عراق", ps: "عراقي دينار", symbol: "ID" },
  EGP: { en: "Egyptian Pound", fa: "پوند مصر", ps: "مصري پونډ", symbol: "E£" },
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
  THB: { en: "Thai Baht", fa: "بات تایلند", ps: "تایلنډي بات", symbol: "฿" },
  HKD: { en: "Hong Kong Dollar", fa: "دالر هنگ‌کنگ", ps: "هانګ کانګ ډالر", symbol: "HK$" },
  NZD: { en: "New Zealand Dollar", fa: "دالر نیوزیلند", ps: "نیوزیلنډي ډالر", symbol: "NZ$" },
  KRW: { en: "South Korean Won", fa: "وون کره جنوبی", ps: "کوریایي ون", symbol: "₩" },
  SEK: { en: "Swedish Krona", fa: "کرون سوئد", ps: "سویډني کرون", symbol: "kr" },
  NOK: { en: "Norwegian Krone", fa: "کرون نروژ", ps: "نارویژي کرون", symbol: "kr" },
  DKK: { en: "Danish Krone", fa: "کرون دانمارک", ps: "ډنمارکي کرون", symbol: "kr" },
  PLN: { en: "Polish Zloty", fa: "زلوتی لهستان", ps: "پولنډي زلوټي", symbol: "zł" },
  BRL: { en: "Brazilian Real", fa: "رئال برزیل", ps: "برازیلي ریال", symbol: "R$" },
  ZAR: { en: "South African Rand", fa: "رند آفریقای جنوبی", ps: "جنوبي افریقایي رینډ", symbol: "R" },
  TJS: { en: "Tajikistani Somoni", fa: "سامانی تاجیکستان", ps: "تاجکستاني سوموني", symbol: "SM" },
  UZS: { en: "Uzbekistani Som", fa: "سوم ازبکستان", ps: "ازبکستاني سوم", symbol: "soʻm" },
  TMT: { en: "Turkmenistani Manat", fa: "منات ترکمنستان", ps: "ترکمنستاني منات", symbol: "m" },
  KZT: { en: "Kazakhstani Tenge", fa: "تنگه قزاقستان", ps: "قزاقي تنګه", symbol: "₸" },
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

/** Replace ISO currency codes in journal text with localized currency names. */
export function localizeCurrencyCodesInText(
  text: string,
  locale: AppLocale,
): string {
  const raw = (text ?? "").trim();
  if (!raw) return raw;
  return raw.replace(/\b([A-Z]{2,3})\b/g, (code) => {
    const row = CURRENCY_I18N[code];
    if (!row) return code;
    return localizedCurrencyName(code, locale, code);
  });
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
  const n = parseSignedAmountNumber(amount);
  if (!Number.isFinite(n) || n === 0) return "money-neutral";
  return n > 0 ? "money-in" : "money-out";
}
