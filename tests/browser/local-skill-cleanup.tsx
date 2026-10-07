import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}
const harness = {
  cleanup: gate<{
    removed: number;
    failures: { path: string; reason: string }[];
  }>(),
  refresh: gate<void>(),
  selected: [] as string[],
  refreshStarted: false,
  errors: [] as string[],
  empty: false,
};
window.addEventListener("error", (event) => harness.errors.push(event.message));
window.addEventListener("unhandledrejection", (event) =>
  harness.errors.push(String(event.reason)),
);
Object.assign(window, {
  localCleanupHarness: harness,
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: { locationIds?: string[] }) => {
      if (command === "get_settings") return "zh";
      if (command === "get_local_cleanup_plan")
        return harness.empty
          ? []
          : [
              {
                id: "grok-one",
                tool: "grok",
                path: "<workspace>/grok/skills/one",
                empty_root: false,
              },
              {
                id: "grok-two",
                tool: "grok",
                path: "<workspace>/grok/skills/two",
                empty_root: false,
              },
              {
                id: "qwen-empty",
                tool: "qwen_code",
                path: "<workspace>/qwen/skills",
                empty_root: true,
              },
            ];
      if (command === "cleanup_uninstalled_agent_skills") {
        harness.selected = args.locationIds ?? [];
        return harness.cleanup.promise;
      }
    },
  },
});
const { i18nReady } = await import("../../src/i18n/index");
await i18nReady;
const { LocalSkillCleanup } =
  await import("../../src/components/LocalSkillCleanup");
const { Toaster } = await import("sonner");
createRoot(document.getElementById("root")!).render(
  <>
    <LocalSkillCleanup
      disabled={false}
      runScan={async () => {
        harness.refreshStarted = true;
        await harness.refresh.promise;
      }}
      onChanged={async () => {}}
    />
    <Toaster />
  </>,
);
