import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";

function gate() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const harness = {
  deletion: gate(),
  refresh: gate(),
  deleteStarted: false,
  refreshStarted: false,
  refreshDone: false,
  errors: [] as string[],
};
window.addEventListener("error", (event) => harness.errors.push(event.message));
window.addEventListener("unhandledrejection", (event) =>
  harness.errors.push(String(event.reason)),
);
Object.assign(window, {
  localDeleteHarness: harness,
  __TAURI_INTERNALS__: {
    invoke: async (command: string) => {
      if (command === "get_settings") return "zh";
      if (command === "delete_discovered_skill") {
        harness.deleteStarted = true;
        await harness.deletion.promise;
      }
    },
  },
});

const { i18nReady } = await import("../../src/i18n/index");
await i18nReady;
const { LocalSkillsPanel } =
  await import("../../src/components/LocalSkillsPanel");
const { Toaster } = await import("sonner");
const scanResult = {
  tools_scanned: 1,
  skills_found: 1,
  groups: [
    {
      name: "demo",
      fingerprint: "version-a",
      imported: false,
      found_at: 0,
      locations: [
        {
          id: "location-a",
          tool: "codex",
          found_path: "<workspace>/codex/demo",
        },
      ],
    },
  ],
};

createRoot(document.getElementById("root")!).render(
  <div className="p-6">
    <LocalSkillsPanel
      scanResult={scanResult}
      scanLoading={false}
      importingPaths={new Set()}
      importingAll={false}
      runScan={async () => {
        harness.refreshStarted = true;
        await harness.refresh.promise;
        harness.refreshDone = true;
      }}
      onChanged={async () => {}}
      handleImportDiscovered={async () => {}}
      handleImportAllDiscovered={async () => {}}
    />
    <Toaster />
  </div>,
);
