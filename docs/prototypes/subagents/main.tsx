// Throwaway host: reuse the workbench chrome and theme tokens, with demo data.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SubagentsPrototype } from "./SubagentsPrototype";
import "../../../src/index.css";
import "./subagents-prototype.css";

document.documentElement.classList.toggle(
  "dark",
  new URLSearchParams(location.search).get("theme") !== "light",
);
Object.assign(window, { __TAURI_INTERNALS__: { invoke: async () => null } });
const { default: i18n, i18nReady } = await import("../../../src/i18n");
await i18nReady;
await i18n.changeLanguage("zh");

export function Host() {
  const [view, setView] = useState<"library" | "project">("library");
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-primary">
      {/* Title bar stand-in: keeps DetailSheet geometry identical to the app. */}
      <div
        className="flex shrink-0 items-center justify-center border-b border-border-subtle bg-bg-secondary text-xs text-muted"
        style={{ height: "var(--app-titlebar-height)" }}
      >
        Subagent 管理 · 交互原型
      </div>
      <SubagentsPrototype view={view} onViewChange={setView} />
      <div
        className="flex shrink-0 items-center gap-3 border-t border-border-subtle bg-bg-secondary px-3 text-xs text-muted"
        style={{ height: "var(--app-statusbar-height)" }}
      >
        <span>AgentHub 原型</span>
        <span className="ml-auto">演示数据</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Host />);
