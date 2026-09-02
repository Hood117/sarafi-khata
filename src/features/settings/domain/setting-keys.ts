/**
 * Known SystemSetting keys used by the app.
 * Values are stored as strings in `SystemSetting.value`.
 */
export const SETTING_KEYS = {
  businessName: "app.name",
  baseCurrencyCode: "app.baseCurrencyCode",
  locale: "app.locale",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export const DEFAULT_APP_SETTINGS = {
  businessName: "ASMS",
  baseCurrencyCode: "AFN",
  locale: "en",
} as const;

/** App locale options — en LTR; fa/ps RTL. */
export const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fa", label: "Dari (دری)" },
  { value: "ps", label: "Pashto (پښتو)" },
] as const;
