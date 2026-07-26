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
  businessName: "Saraf",
  baseCurrencyCode: "AFN",
  locale: "en",
} as const;

/** Placeholder locale options — i18n/RTL lands later. */
export const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fa", label: "Dari (coming soon)", disabled: true },
  { value: "ps", label: "Pashto (coming soon)", disabled: true },
] as const;
