import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { App } from "@desktop/App";
import { AuthProvider } from "@desktop/auth";
import { DesktopLocaleProvider } from "@desktop/i18n";
import { logAppError } from "@desktop/lib/app-error";
import { AppErrorBoundary } from "@desktop/ui/error-boundary";
import { DesktopUiTextPrefsProvider } from "@desktop/ui-text-prefs";
import { DESKTOP_UI_SKIN } from "@desktop/ui-skin";
import "@desktop/styles.css";
import "@desktop/styles-liquid-glass.css";
import "@desktop/styles-dark.css";
import "@desktop/styles-web.css";
import "@desktop/styles-online-dashboard.css";
import "@desktop/styles-online-surfaces.css";
import "@desktop/styles-online-records.css";
import "@desktop/styles-motion.css";

try {
  const storedTheme = localStorage.getItem("saraf.ui.theme");
  if (storedTheme === "dark") {
    document.documentElement.dataset.theme = "dark";
  }
} catch {
  /* ignore */
}

if (DESKTOP_UI_SKIN) {
  document.documentElement.dataset.ui = DESKTOP_UI_SKIN;
} else {
  delete document.documentElement.dataset.ui;
}

window.addEventListener("unhandledrejection", (event) => {
  logAppError("unhandledrejection", event.reason);
});

window.addEventListener("error", (event) => {
  logAppError("window.onerror", event.error ?? event.message);
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(
  <HashRouter>
    <DesktopLocaleProvider>
      <DesktopUiTextPrefsProvider>
        <AuthProvider>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </AuthProvider>
      </DesktopUiTextPrefsProvider>
    </DesktopLocaleProvider>
  </HashRouter>,
);
