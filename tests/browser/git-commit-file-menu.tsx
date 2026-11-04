import { createRoot } from "react-dom/client";
import { GitCommitFileMenu } from "../../src/components/git/GitCommitFileMenu";
import "../../src/i18n";
import "../../src/index.css";
const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
const scale = params.get("scale") === "1.25" ? "1.25" : "1";
document.documentElement.style.zoom = scale;
document.documentElement.style.setProperty("--app-scale", scale);
createRoot(document.getElementById("root")!).render(
  <div className="min-h-screen bg-surface p-8 text-secondary">
    <GitCommitFileMenu
      target={{ projectId: "demo", worktreePath: "/workspace/demo" }}
      sha={"a".repeat(40)}
      path="docs/changes/example.md"
      deleted={false}
      onSelect={(selection) => {
        document.title = selection.view ?? "diff";
      }}
    >
      <button className="text-xs">docs/changes/example.md</button>
    </GitCommitFileMenu>
  </div>,
);
