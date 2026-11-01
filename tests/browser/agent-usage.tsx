import { createRoot } from "react-dom/client";
import { AgentUsageStatusBar } from "../../src/components/usage/AgentUsageStatusBar";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";

// Isolated real component preview; no app database, CLI or account access.
const params = new URLSearchParams(location.search);
// Background preview frames still need deterministic synthetic quota snapshots.
Object.defineProperty(document, "hasFocus", {
  configurable: true,
  value: () => true,
});
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  value: "visible",
});
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
applyTextSize(params.get("text-size") ?? "default");
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (command: string) => {
      if (command === "get_settings") return params.get("language") ?? "zh";
      if (command === "set_settings") return;
      if (command !== "get_agent_usage")
        throw new Error("Unsupported preview request");
      const now = Math.floor(Date.now() / 1000);
      return [
        {
          provider: "claude",
          status: "ready",
          windows: [
            {
              key: "five_hour",
              used_percent: 23,
              resets_at: now + 7200,
              window_minutes: 300,
            },
            {
              key: "seven_day",
              used_percent: 81,
              resets_at: now + 172800,
              window_minutes: 10080,
            },
          ],
          updated_at: now,
          retry_after_seconds: null,
        },
        {
          provider: "codex",
          status: "ready",
          windows: [
            {
              key: "five_hour",
              used_percent: 0,
              resets_at: now + 3600,
              window_minutes: 300,
            },
          ],
          updated_at: now,
          retry_after_seconds: null,
        },
      ];
    },
  },
});
const { i18nReady } = await import("../../src/i18n");
await i18nReady;
createRoot(document.getElementById("root")!).render(
  <div className="flex h-full flex-col bg-background text-primary">
    <main className="min-h-0 flex-1 p-6 text-muted">AgentHub</main>
    <footer className="workbench-statusbar flex shrink-0 items-center gap-3 bg-bg-secondary px-2 text-xs text-muted">
      <span>AgentHub</span>
      <AgentUsageStatusBar />
    </footer>
  </div>,
);
