import { useState } from "react";
import { createRoot } from "react-dom/client";
import { applyTextSize } from "../../src/lib/textScale";
import { GitReferenceSummary } from "../../src/components/git/GitReferenceSummary";
import { GitGraphRefBadges } from "../../src/components/git/GitGraphRefBadges";
import { GitTagActionsProvider } from "../../src/components/git/GitTagActionsProvider";
import "../../src/index.css";
import "../../src/components/git/git.css";

const params = new URLSearchParams(location.search);
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (command: string) => {
      if (command === "get_project_git_remotes")
        return [
          { name: "origin", url: "" },
          { name: "mirror", url: "" },
        ];
      if (command === "get_settings") return params.get("language") ?? "zh";
      throw new Error("Synthetic preview: no repository writes");
    },
  },
});
const { default: i18n, i18nReady } = await import("../../src/i18n");
await i18nReady;
await i18n.changeLanguage(params.get("language") ?? "zh");
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
applyTextSize(params.get("size") ?? "default");
const name = "archive/releases/a-long-tag-name-v5.0.0.4791";
const sha = "a".repeat(40);
export function Preview() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="min-h-screen bg-background p-6 text-secondary">
      <p className="mb-4 text-sm">Git tags · Synthetic preview</p>
      <GitTagActionsProvider
        target={{ projectId: "demo", worktreePath: "/workspace/demo" }}
        busy={false}
        openGraph={(sha) => {
          document.title = `Graph: ${sha}`;
        }}
        refresh={() => {}}
        onRun={async (operation) => {
          try {
            await operation();
            return true;
          } catch {
            return false;
          }
        }}
      >
        <details
          className="relative w-64 border border-border text-xs"
          open={expanded}
          onToggle={(event) => setExpanded(event.currentTarget.open)}
        >
          <GitReferenceSummary
            entry={{ kind: "tags", name, sha, summary: "Example release" }}
            expanded={expanded}
            onExpandedChange={setExpanded}
            onRefresh={() => {}}
          />
          <p className="p-2">Example tag history</p>
        </details>
        <div className="mt-8 overflow-auto text-sm">
          <GitGraphRefBadges
            refs={[{ name, kind: "tag", remote: false }]}
            sha={sha}
            color={0}
            onDetails={() => {}}
          />
        </div>
      </GitTagActionsProvider>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
