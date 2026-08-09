import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { App } from "@desktop/App";
import { AuthProvider } from "@desktop/auth";
import { DesktopLocaleProvider } from "@desktop/i18n";
import "@desktop/styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(
  <HashRouter>
    <DesktopLocaleProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </DesktopLocaleProvider>
  </HashRouter>,
);
