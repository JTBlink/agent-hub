import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import i18n, { i18nReady } from "./i18n";
import { logStartupEvent } from "./lib/tauri";
import "./index.css";
import App from "./App";
import { DesktopRuntimeBoundary } from "./app/DesktopRuntimeBoundary";
import { verifyBuildInfo } from "./app/product/buildInfo";

const desktop = "__TAURI_INTERNALS__" in window;
await i18nReady;
try {
  await verifyBuildInfo();
} catch (error) {
  const host = document.getElementById("root");
  if (host) {
    host.setAttribute("role", "alert");
    host.textContent = i18n.t("product.buildMismatch");
  }
  throw error;
}
if (desktop) logStartupEvent("i18n_ready", performance.now()).catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopRuntimeBoundary desktop={desktop}>
      <App />
    </DesktopRuntimeBoundary>
  </StrictMode>,
);
if (desktop)
  logStartupEvent("root_rendered", performance.now()).catch(() => {});
