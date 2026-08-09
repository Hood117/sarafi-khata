import type { AppLocale } from "@/lib/i18n/locale";
import { en } from "@/lib/i18n/messages/en";
import { fa } from "@/lib/i18n/messages/fa";
import { ps } from "@/lib/i18n/messages/ps";
import type { Dictionary } from "@/lib/i18n/messages/types";

export type { Dictionary } from "@/lib/i18n/messages/types";

const dictionaries: Record<AppLocale, Dictionary> = { en, fa, ps };

export function getDictionary(locale: AppLocale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

/** Replace {name} placeholders in a translated string. */
export function formatMessage(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? match : String(value);
  });
}
