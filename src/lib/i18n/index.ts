export type { AppLocale } from "@/lib/i18n/locale";
export {
  APP_LOCALES,
  isAppLocale,
  localeDirection,
  localeHtmlLang,
  localeIntlTag,
} from "@/lib/i18n/locale";
export {
  formatMessage,
  getDictionary,
  type Dictionary,
} from "@/lib/i18n/dictionary";
export {
  LocaleProvider,
  useLocale,
  useT,
} from "@/lib/i18n/locale-provider";
