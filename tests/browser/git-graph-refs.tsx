import { createRoot } from "react-dom/client";
import i18n, { i18nReady } from "../../src/i18n";
import { applyTextSize } from "../../src/lib/textScale";
import type { GitGraphCommit } from "../../src/lib/gitApi";
import { GitGraphTable } from "../../src/components/git/GitGraphTable";
import "../../src/index.css";
import "../../src/components/git/git.css";

// Synthetic repository topology and labels; no files, processes or network remotes are read.
const params = new URLSearchParams(location.search);
await i18nReady;
await i18n.changeLanguage(params.get("language") ?? "zh");
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
applyTextSize(params.get("size") ?? "default");
const branchNames = [
  "docs/usage-guide-publish-workspace-installation-details",
  "docs/setup-instructions",
];
const commits: GitGraphCommit[] = branchNames.map((name, index) => ({
  sha: `docs-${index}`,
  summary: index
    ? "docs: Explain project setup and skill deployment"
    : "docs: Update workspace installation instructions",
  author: "Example",
  time: 1793408400 + index,
  parents: ["head"],
  refs: [
    { name, remote: false, kind: "branch" },
    {
      name: `origin/${name}`,
      remote: true,
      kind: "remote",
      remote_name: "origin",
    },
  ],
}));
commits.push({
  sha: "head",
  head: true,
  summary: "Merge branch 'feature/workspace' into 'main'",
  author: "Example",
  time: 1793408300,
  parents: ["base"],
  refs: [
    { name: "main", remote: false, kind: "branch", current: true },
    {
      name: "origin/main",
      remote: true,
      kind: "remote",
      remote_name: "origin",
    },
    {
      name: "origin/HEAD",
      remote: true,
      kind: "remote",
      remote_name: "origin",
    },
    {
      name: `origin/automation/temporary/${"abcdef0123456789".repeat(12)}`,
      remote: true,
      kind: "remote",
      remote_name: "origin",
    },
  ],
});
commits.push({
  sha: "base",
  summary: "fix: Preserve terminal sessions across worktrees ".repeat(10),
  author: "Example",
  time: 1793408200,
  parents: [],
  refs: [{ name: "v1.0.0", remote: false, kind: "tag" }],
});
createRoot(document.getElementById("root")!).render(
  <div className="flex h-screen flex-col bg-background p-2 text-primary">
    <GitGraphTable
      commits={commits}
      changedFiles={13}
      query=""
      loading={false}
      onSelect={() => {}}
    />
  </div>,
);
