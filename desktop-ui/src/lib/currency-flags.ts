/** Bundled local SVG flag icons (no network, no emoji). */
import flagAed from "@desktop/assets/flags/aed.svg";
import flagAfn from "@desktop/assets/flags/afn.svg";
import flagAud from "@desktop/assets/flags/aud.svg";
import flagCad from "@desktop/assets/flags/cad.svg";
import flagChf from "@desktop/assets/flags/chf.svg";
import flagCny from "@desktop/assets/flags/cny.svg";
import flagEur from "@desktop/assets/flags/eur.svg";
import flagGbp from "@desktop/assets/flags/gbp.svg";
import flagInr from "@desktop/assets/flags/inr.svg";
import flagIrr from "@desktop/assets/flags/irr.svg";
import flagJpy from "@desktop/assets/flags/jpy.svg";
import flagKwd from "@desktop/assets/flags/kwd.svg";
import flagMyr from "@desktop/assets/flags/myr.svg";
import flagOmr from "@desktop/assets/flags/omr.svg";
import flagPkr from "@desktop/assets/flags/pkr.svg";
import flagQar from "@desktop/assets/flags/qar.svg";
import flagRub from "@desktop/assets/flags/rub.svg";
import flagSar from "@desktop/assets/flags/sar.svg";
import flagSgd from "@desktop/assets/flags/sgd.svg";
import flagTry from "@desktop/assets/flags/try.svg";
import flagUnknown from "@desktop/assets/flags/unknown.svg";
import flagUsd from "@desktop/assets/flags/usd.svg";

const CURRENCY_FLAG_SRC: Record<string, string> = {
  AFN: flagAfn,
  PKR: flagPkr,
  IRR: flagIrr,
  INR: flagInr,
  TRY: flagTry,
  SAR: flagSar,
  AED: flagAed,
  QAR: flagQar,
  OMR: flagOmr,
  KWD: flagKwd,
  USD: flagUsd,
  EUR: flagEur,
  GBP: flagGbp,
  CHF: flagChf,
  JPY: flagJpy,
  CNY: flagCny,
  CAD: flagCad,
  AUD: flagAud,
  RUB: flagRub,
  SGD: flagSgd,
  MYR: flagMyr,
};

/** Local bundled SVG URL for a currency code (offline-safe). */
export function currencyFlagSrc(code: string): string {
  return CURRENCY_FLAG_SRC[code.toUpperCase()] ?? flagUnknown;
}

export function hasBundledCurrencyFlag(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    CURRENCY_FLAG_SRC,
    code.trim().toUpperCase(),
  );
}

/** ISO 4217 → ISO 3166-1 alpha-2 (best-effort for flag emoji). */
const CURRENCY_COUNTRY: Record<string, string> = {
  AFN: "AF",
  ALL: "AL",
  DZD: "DZ",
  AOA: "AO",
  ARS: "AR",
  AMD: "AM",
  AWG: "AW",
  AUD: "AU",
  AZN: "AZ",
  BSD: "BS",
  BHD: "BH",
  BDT: "BD",
  BBD: "BB",
  BYN: "BY",
  BZD: "BZ",
  BMD: "BM",
  BTN: "BT",
  BOB: "BO",
  BAM: "BA",
  BWP: "BW",
  BRL: "BR",
  BND: "BN",
  BGN: "BG",
  BIF: "BI",
  KHR: "KH",
  CAD: "CA",
  CVE: "CV",
  KYD: "KY",
  XAF: "CM",
  CLP: "CL",
  CNY: "CN",
  COP: "CO",
  KMF: "KM",
  CDF: "CD",
  CRC: "CR",
  CUP: "CU",
  CZK: "CZ",
  DKK: "DK",
  DJF: "DJ",
  DOP: "DO",
  XCD: "AG",
  EGP: "EG",
  ERN: "ER",
  ETB: "ET",
  EUR: "EU",
  FJD: "FJ",
  GMD: "GM",
  GEL: "GE",
  GHS: "GH",
  GIP: "GI",
  GTQ: "GT",
  GNF: "GN",
  GYD: "GY",
  HTG: "HT",
  HNL: "HN",
  HKD: "HK",
  HUF: "HU",
  ISK: "IS",
  INR: "IN",
  IDR: "ID",
  IRR: "IR",
  IQD: "IQ",
  ILS: "IL",
  JMD: "JM",
  JPY: "JP",
  JOD: "JO",
  KZT: "KZ",
  KES: "KE",
  KWD: "KW",
  KGS: "KG",
  LAK: "LA",
  LBP: "LB",
  LSL: "LS",
  LRD: "LR",
  LYD: "LY",
  MOP: "MO",
  MKD: "MK",
  MGA: "MG",
  MWK: "MW",
  MYR: "MY",
  MVR: "MV",
  MRU: "MR",
  MUR: "MU",
  MXN: "MX",
  MDL: "MD",
  MNT: "MN",
  MAD: "MA",
  MZN: "MZ",
  MMK: "MM",
  NAD: "NA",
  NPR: "NP",
  ANG: "CW",
  NZD: "NZ",
  NIO: "NI",
  NGN: "NG",
  KPW: "KP",
  NOK: "NO",
  OMR: "OM",
  PKR: "PK",
  PAB: "PA",
  PGK: "PG",
  PYG: "PY",
  PEN: "PE",
  PHP: "PH",
  PLN: "PL",
  QAR: "QA",
  RON: "RO",
  RUB: "RU",
  RWF: "RW",
  SHP: "SH",
  WST: "WS",
  STN: "ST",
  SAR: "SA",
  RSD: "RS",
  SCR: "SC",
  SLL: "SL",
  SGD: "SG",
  SBD: "SB",
  SOS: "SO",
  ZAR: "ZA",
  KRW: "KR",
  SSP: "SS",
  LKR: "LK",
  SDG: "SD",
  SRD: "SR",
  SEK: "SE",
  CHF: "CH",
  SYP: "SY",
  TWD: "TW",
  TJS: "TJ",
  TZS: "TZ",
  THB: "TH",
  TOP: "TO",
  TTD: "TT",
  TND: "TN",
  TRY: "TR",
  TMT: "TM",
  UGX: "UG",
  UAH: "UA",
  AED: "AE",
  GBP: "GB",
  USD: "US",
  UYU: "UY",
  UZS: "UZ",
  VUV: "VU",
  VES: "VE",
  VND: "VN",
  XOF: "SN",
  XPF: "PF",
  YER: "YE",
  ZMW: "ZM",
  ZWL: "ZW",
};

function regionalIndicator(char: string): string {
  const code = char.toUpperCase().charCodeAt(0);
  if (code < 65 || code > 90) return "";
  return String.fromCodePoint(0x1f1e6 + (code - 65));
}

/** ISO 4217 → ISO 3166-1 alpha-2 for flag lookup. */
export function currencyCountryCode(code: string): string | null {
  const upper = code.trim().toUpperCase();
  if (!upper || upper === "ALL") return null;
  return CURRENCY_COUNTRY[upper] ?? null;
}

/** Unicode flag emoji for a currency (offline; no network). */
export function currencyFlagEmoji(code: string): string {
  const upper = code.trim().toUpperCase();
  const country = CURRENCY_COUNTRY[upper];
  if (!country || country.length !== 2) return "🏳️";
  if (country === "EU") return "🇪🇺";
  const a = regionalIndicator(country[0]!);
  const b = regionalIndicator(country[1]!);
  return a && b ? `${a}${b}` : "🏳️";
}
