export type AppLocale = "en" | "fa" | "ps";

export const APP_LOCALES: readonly AppLocale[] = ["en", "fa", "ps"] as const;

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}

export function localeDirection(locale: AppLocale): "ltr" | "rtl" {
  return locale === "en" ? "ltr" : "rtl";
}

/** BCP-47 tags for <html lang>. Dari uses fa-AF (Afghanistan). */
export function localeHtmlLang(locale: AppLocale): string {
  if (locale === "fa") {
    return "fa-AF";
  }
  if (locale === "ps") {
    return "ps-AF";
  }
  return "en";
}

export function localeIntlTag(locale: AppLocale): string {
  return localeHtmlLang(locale);
}
