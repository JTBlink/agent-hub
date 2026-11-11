import { useState } from "react";
import { createRoot } from "react-dom/client";
import { gitFixture } from "./git-fixture";
import type { GitStatus } from "../../src/lib/gitApi";
import type { CommitFileSelection } from "../../src/components/git/GitCommitDetails";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";
import "../../src/components/git/git.css";

const params = new URLSearchParams(location.search);
const recentPages = Array.from({ length: 45 }, (_, index) => ({
  sha: (1000 + index).toString(16).padStart(40, "0"),
  summary: `Example commit ${index + 1}`,
  author: "example",
  time: 1793408400 - index * 60,
}));
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args?: unknown) => {
      if (params.has("graph") && command === "get_project_git_graph") {
        const limit =
          typeof args === "object" && args !== null && "limit" in args
            ? Number(args.limit)
            : 200;
        return {
          commits: Array.from({ length: limit }, (_, index) => ({
            sha: (1000 + index).toString(16).padStart(40, "0"),
            summary: `Example graph commit ${index + 1}`,
            author: "Example",
            time: 1793408400 - index * 60,
            parents:
              index < 4999
                ? [(1001 + index).toString(16).padStart(40, "0")]
                : [],
            refs:
              params.has("branches") && index < 30
                ? [
                    {
                      name:
                        index === 0
                          ? "main"
                          : `topic/${String(index).padStart(2, "0")}-${"long-branch-name-".repeat(3)}`,
                      remote: false,
                    },
                    ...(typeof args === "object" &&
                    args !== null &&
                    "includeRemotes" in args &&
                    args.includeRemotes
                      ? [{ name: `origin/topic/${index}`, remote: true }]
                      : []),
                  ]
                : index === 0
                  ? [{ name: "main", remote: false }]
                  : [],
          })),
          has_more: limit < 5000,
        };
      }
      if (params.has("many-commits") && command === "get_project_git_history") {
        const offset =
          typeof args === "object" && args !== null && "offset" in args
            ? Number(args.offset)
            : 0;
        return {
          commits: recentPages.slice(offset, offset + 10),
          has_more: offset + 10 < recentPages.length,
        };
      }
      const result = gitFixture(command, args);
      if (result.handled) return result.value;
      if (command === "get_settings") return params.get("language") ?? "en";
      return null;
    },
  },
});
const { i18nReady } = await import("../../src/i18n/index");
await i18nReady;
const { GitGraph } = await import("../../src/components/git/GitGraph");
const { GitHistory } = await import("../../src/components/git/GitHistory");
const { GitDiffViewer } =
  await import("../../src/components/git/GitDiffViewer");
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
applyTextSize(params.get("text-size") ?? "default");
const status = gitFixture("get_project_git_status", { projectId: "example" })
  .value as GitStatus;
if (params.has("many-commits")) {
  status.commits = recentPages.slice(0, 30);
  status.head = recentPages[0].sha;
}
export function Preview() {
  const [selected, setSelected] = useState<CommitFileSelection>();
  const patch = selected
    ? (gitFixture("get_project_git_commit_diff", {}).value as string)
    : "";
  if (params.has("graph"))
    return (
      <div
        className="flex flex-col bg-background text-primary"
        style={{ height: "calc(100vh / var(--app-scale))" }}
      >
        <GitGraph
          target={{ projectId: "example" }}
          revision={0}
          changedFiles={2}
          onSelect={setSelected}
          onClose={() => {}}
          busy={false}
          fetching={false}
          onFetch={() => {}}
          onRefresh={() => {}}
        />
      </div>
    );
  return (
    <div
      className="flex bg-background text-primary"
      style={{ height: "calc(100vh / var(--app-scale))" }}
    >
      <aside
        className="git-sidebar flex min-h-0 flex-col border-r border-border bg-bg-secondary"
        style={{ width: 320, flexShrink: 0 }}
      >
        <GitHistory
          status={status}
          loading={false}
          target={{ projectId: "example" }}
          selected={selected}
          onSelect={setSelected}
          onRefresh={() => {}}
        />
      </aside>
      <section className="git-panel flex min-h-0 min-w-0 flex-1 flex-col">
        {selected && (
          <GitDiffViewer
            patch={patch}
            staged={false}
            historical
            path={selected.path}
          />
        )}
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
