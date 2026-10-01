import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "antd/dist/reset.css";
import "./styles.css";
import { AppProviders } from "./app/AppProviders";
import { createI18n } from "./i18n";
import { loadUiPrefs } from "./prefs/uiPrefs";
import { setWorkspaceDefaults } from "./workspace/defaults";
import { AppRoutes } from "./routes/AppRoutes";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function start() {
  // Written as a literal so Vite removes this whole block, dynamic import included, from production builds (safeguard 1).
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") {
    const { startMockWorker } = await import("./mocks/browser");
    await startMockWorker(API_BASE_URL);
    // A sample case so the Workspace opens with a verdict; add `?blank` to the address to start from an empty form.
    if (!new URLSearchParams(window.location.search).has("blank")) {
      const [{ MOCK_QUOTE_INPUT }, { parseSnapshot }] = await Promise.all([import("./mocks/fixtures"), import("./form/load")]);
      setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
    }
  }

  const i18n = await createI18n(loadUiPrefs().language);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppProviders baseUrl={API_BASE_URL} i18n={i18n}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </React.StrictMode>,
  );
}

void start();
