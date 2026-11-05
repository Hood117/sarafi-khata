import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getUiTextPrefs, setUiTextPrefs } from "@desktop/api";

export type UiFontSize = "small" | "default" | "large" | "extra-large";
export type UiFontFamily = "default";

const FONT_SIZE_KEY = "saraf.ui.fontSize";
const FONT_FAMILY_KEY = "saraf.ui.fontFamily";
const BOLD_TEXT_KEY = "saraf.ui.boldText";
const THEME_KEY = "saraf.ui.theme";

export type UiTheme = "light" | "dark";

const UI_THEMES: readonly UiTheme[] = ["light", "dark"] as const;

export function isUiTheme(value: string): value is UiTheme {
  return (UI_THEMES as readonly string[]).includes(value);
}

export const UI_THEMES_LIST = UI_THEMES;

const FONT_SIZES: readonly UiFontSize[] = [
  "small",
  "default",
  "large",
  "extra-large",
] as const;

const FONT_FAMILIES: readonly UiFontFamily[] = ["default"] as const;

export function isUiFontSize(value: string): value is UiFontSize {
  return (FONT_SIZES as readonly string[]).includes(value);
}

export function isUiFontFamily(value: string): value is UiFontFamily {
  return (FONT_FAMILIES as readonly string[]).includes(value);
}

export const UI_FONT_SIZES = FONT_SIZES;
export const UI_FONT_FAMILIES = FONT_FAMILIES;

type UiTextPrefsContextValue = {
  fontSize: UiFontSize;
  fontFamily: UiFontFamily;
  boldText: boolean;
  theme: UiTheme;
  setFontSize: (fontSize: UiFontSize) => Promise<void>;
  setFontFamily: (fontFamily: UiFontFamily) => Promise<void>;
  setBoldText: (boldText: boolean) => Promise<void>;
  setTheme: (theme: UiTheme) => Promise<void>;
  setUiTextAppearance: (prefs: {
    fontSize: UiFontSize;
    fontFamily: UiFontFamily;
    boldText: boolean;
    theme: UiTheme;
  }) => Promise<void>;
  ready: boolean;
};

const UiTextPrefsContext = createContext<UiTextPrefsContextValue | null>(null);

function readStoredFontSize(): UiFontSize {
  try {
    const raw = localStorage.getItem(FONT_SIZE_KEY);
    if (raw && isUiFontSize(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "default";
}

function readStoredFontFamily(): UiFontFamily {
  try {
    const raw = localStorage.getItem(FONT_FAMILY_KEY);
    if (raw && isUiFontFamily(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "default";
}

function readStoredBoldText(): boolean {
  try {
    return localStorage.getItem(BOLD_TEXT_KEY) === "true";
  } catch {
    return false;
  }
}

function readStoredTheme(): UiTheme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw && isUiTheme(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "light";
}

export function applyDocumentUiTextPrefs(
  fontSize: UiFontSize,
  boldText: boolean,
  theme: UiTheme = readStoredTheme(),
  fontFamily: UiFontFamily = readStoredFontFamily(),
) {
  const html = document.documentElement;
  html.dataset.fontSize = fontSize;
  html.dataset.fontFamily = fontFamily;
  if (boldText) {
    html.dataset.boldText = "true";
  } else {
    delete html.dataset.boldText;
  }
  if (theme === "dark") {
    html.dataset.theme = "dark";
  } else {
    delete html.dataset.theme;
  }
}

function persistLocal(
  fontSize: UiFontSize,
  boldText: boolean,
  theme: UiTheme,
  fontFamily: UiFontFamily,
) {
  try {
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
    localStorage.setItem(FONT_FAMILY_KEY, fontFamily);
    localStorage.setItem(BOLD_TEXT_KEY, boldText ? "true" : "false");
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function DesktopUiTextPrefsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<UiFontSize>(readStoredFontSize);
  const [fontFamily, setFontFamilyState] = useState<UiFontFamily>(readStoredFontFamily);
  const [boldText, setBoldTextState] = useState<boolean>(readStoredBoldText);
  const [theme, setThemeState] = useState<UiTheme>(readStoredTheme);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyDocumentUiTextPrefs(fontSize, boldText, theme, fontFamily);
  }, [fontSize, boldText, theme, fontFamily]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await getUiTextPrefs();
        if (cancelled) return;
        const nextSize = isUiFontSize(remote.fontSize) ? remote.fontSize : "default";
        const nextFamily = isUiFontFamily(remote.fontFamily) ? remote.fontFamily : "default";
        const nextBold = Boolean(remote.boldText);
        const nextTheme = isUiTheme(remote.theme) ? remote.theme : "light";
        setFontSizeState(nextSize);
        setFontFamilyState(nextFamily);
        setBoldTextState(nextBold);
        setThemeState(nextTheme);
        persistLocal(nextSize, nextBold, nextTheme, nextFamily);
        applyDocumentUiTextPrefs(nextSize, nextBold, nextTheme, nextFamily);
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

  const setUiTextAppearance = useCallback(
    async (prefs: {
      fontSize: UiFontSize;
      fontFamily: UiFontFamily;
      boldText: boolean;
      theme: UiTheme;
    }) => {
      setFontSizeState(prefs.fontSize);
      setFontFamilyState(prefs.fontFamily);
      setBoldTextState(prefs.boldText);
      setThemeState(prefs.theme);
      applyDocumentUiTextPrefs(prefs.fontSize, prefs.boldText, prefs.theme, prefs.fontFamily);
      persistLocal(prefs.fontSize, prefs.boldText, prefs.theme, prefs.fontFamily);
      try {
        await setUiTextPrefs(prefs.fontSize, prefs.boldText, prefs.theme, prefs.fontFamily);
      } catch {
        /* still apply UI prefs if DB write fails */
      }
    },
    [],
  );

  const setFontSize = useCallback(
    async (next: UiFontSize) => {
      await setUiTextAppearance({ fontSize: next, fontFamily, boldText, theme });
    },
    [fontFamily, boldText, theme, setUiTextAppearance],
  );

  const setFontFamily = useCallback(
    async (next: UiFontFamily) => {
      await setUiTextAppearance({ fontSize, fontFamily: next, boldText, theme });
    },
    [fontSize, boldText, theme, setUiTextAppearance],
  );

  const setBoldText = useCallback(
    async (next: boolean) => {
      await setUiTextAppearance({ fontSize, fontFamily, boldText: next, theme });
    },
    [fontSize, fontFamily, theme, setUiTextAppearance],
  );

  const setTheme = useCallback(
    async (next: UiTheme) => {
      await setUiTextAppearance({ fontSize, fontFamily, boldText, theme: next });
    },
    [fontSize, fontFamily, boldText, setUiTextAppearance],
  );

  const value = useMemo<UiTextPrefsContextValue>(
    () => ({
      fontSize,
      fontFamily,
      boldText,
      theme,
      setFontSize,
      setFontFamily,
      setBoldText,
      setTheme,
      setUiTextAppearance,
      ready,
    }),
    [
      fontSize,
      fontFamily,
      boldText,
      theme,
      setFontSize,
      setFontFamily,
      setBoldText,
      setTheme,
      setUiTextAppearance,
      ready,
    ],
  );

  return (
    <UiTextPrefsContext.Provider value={value}>{children}</UiTextPrefsContext.Provider>
  );
}

export function useUiTextPrefs(): UiTextPrefsContextValue {
  const value = useContext(UiTextPrefsContext);
  if (!value) {
    throw new Error("useUiTextPrefs must be used within DesktopUiTextPrefsProvider");
  }
  return value;
}
