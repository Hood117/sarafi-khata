"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { Dictionary } from "@/lib/i18n/dictionary";
import type { AppLocale } from "@/lib/i18n/locale";
import { localeDirection, localeIntlTag } from "@/lib/i18n/locale";

type LocaleContextValue = {
  locale: AppLocale;
  dir: "ltr" | "rtl";
  intlLocale: string;
  dictionary: Dictionary;
  t: Dictionary;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: AppLocale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: localeDirection(locale),
      intlLocale: localeIntlTag(locale),
      dictionary,
      t: dictionary,
    }),
    [locale, dictionary],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used within LocaleProvider.");
  }
  return value;
}

/** Shorthand: returns the dictionary (`t.nav.hawala`, …). */
export function useT(): Dictionary {
  return useLocale().t;
}
