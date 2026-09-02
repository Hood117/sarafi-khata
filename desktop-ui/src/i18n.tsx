import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getAppLocale, setAppLocale } from "@desktop/api";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionary";
import {
  isAppLocale,
  localeDirection,
  localeHtmlLang,
  localeIntlTag,
  type AppLocale,
} from "@/lib/i18n/locale";
import { installWesternDigitsGuard } from "@desktop/lib/western-digits";

const STORAGE_KEY = "saraf.locale";

type LocaleContextValue = {
  locale: AppLocale;
  dir: "ltr" | "rtl";
  intlLocale: string;
  t: Dictionary;
  setLocale: (locale: AppLocale) => Promise<void>;
  ready: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isAppLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "en";
}

function applyDocumentLocale(locale: AppLocale) {
  const html = document.documentElement;
  html.lang = localeHtmlLang(locale);
  html.dir = localeDirection(locale);
  html.dataset.locale = locale;
}

export function DesktopLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(readStoredLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => installWesternDigitsGuard(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await getAppLocale();
        if (!cancelled && isAppLocale(remote.locale)) {
          setLocaleState(remote.locale);
          try {
            localStorage.setItem(STORAGE_KEY, remote.locale);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* offline / first boot — keep localStorage */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: AppLocale) => {
    setLocaleState(next);
    applyDocumentLocale(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    try {
      await setAppLocale(next);
    } catch {
      /* still apply UI locale if DB write fails */
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: localeDirection(locale),
      intlLocale: localeIntlTag(locale),
      t: getDictionary(locale),
      setLocale,
      ready,
    }),
    [locale, setLocale, ready],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used within DesktopLocaleProvider.");
  }
  return value;
}

export function useT(): Dictionary {
  return useLocale().t;
}
