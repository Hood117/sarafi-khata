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

const FONT_SIZE_KEY = "saraf.ui.fontSize";
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

export function isUiFontSize(value: string): value is UiFontSize {
  return (FONT_SIZES as readonly string[]).includes(value);
}

export const UI_FONT_SIZES = FONT_SIZES;

type UiTextPrefsContextValue = {
  fontSize: UiFontSize;
  boldText: boolean;
  theme: UiTheme;
  setFontSize: (fontSize: UiFontSize) => Promise<void>;
  setBoldText: (boldText: boolean) => Promise<void>;
  setTheme: (theme: UiTheme) => Promise<void>;
  setUiTextAppearance: (prefs: {
    fontSize: UiFontSize;
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
) {
  const html = document.documentElement;
  html.dataset.fontSize = fontSize;
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

function persistLocal(fontSize: UiFontSize, boldText: boolean, theme: UiTheme) {
  try {
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
    localStorage.setItem(BOLD_TEXT_KEY, boldText ? "true" : "false");
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function DesktopUiTextPrefsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<UiFontSize>(readStoredFontSize);
  const [boldText, setBoldTextState] = useState<boolean>(readStoredBoldText);
  const [theme, setThemeState] = useState<UiTheme>(readStoredTheme);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyDocumentUiTextPrefs(fontSize, boldText, theme);
  }, [fontSize, boldText, theme]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await getUiTextPrefs();
        if (cancelled) return;
        const nextSize = isUiFontSize(remote.fontSize) ? remote.fontSize : "default";
        const nextBold = Boolean(remote.boldText);
        const nextTheme = isUiTheme(remote.theme) ? remote.theme : "light";
        setFontSizeState(nextSize);
        setBoldTextState(nextBold);
        setThemeState(nextTheme);
        persistLocal(nextSize, nextBold, nextTheme);
        applyDocumentUiTextPrefs(nextSize, nextBold, nextTheme);
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
    async (prefs: { fontSize: UiFontSize; boldText: boolean; theme: UiTheme }) => {
      setFontSizeState(prefs.fontSize);
      setBoldTextState(prefs.boldText);
      setThemeState(prefs.theme);
      applyDocumentUiTextPrefs(prefs.fontSize, prefs.boldText, prefs.theme);
      persistLocal(prefs.fontSize, prefs.boldText, prefs.theme);
      try {
        await setUiTextPrefs(prefs.fontSize, prefs.boldText, prefs.theme);
      } catch {
        /* still apply UI prefs if DB write fails */
      }
    },
    [],
  );

  const setFontSize = useCallback(
    async (next: UiFontSize) => {
      await setUiTextAppearance({ fontSize: next, boldText, theme });
    },
    [boldText, theme, setUiTextAppearance],
  );

  const setBoldText = useCallback(
    async (next: boolean) => {
      await setUiTextAppearance({ fontSize, boldText: next, theme });
    },
    [fontSize, theme, setUiTextAppearance],
  );

  const setTheme = useCallback(
    async (next: UiTheme) => {
      await setUiTextAppearance({ fontSize, boldText, theme: next });
    },
    [fontSize, boldText, setUiTextAppearance],
  );

  const value = useMemo<UiTextPrefsContextValue>(
    () => ({
      fontSize,
      boldText,
      theme,
      setFontSize,
      setBoldText,
      setTheme,
      setUiTextAppearance,
      ready,
    }),
    [fontSize, boldText, theme, setFontSize, setBoldText, setTheme, setUiTextAppearance, ready],
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
