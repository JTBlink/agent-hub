import { createRoot } from "react-dom/client";
import { useGitEditors } from "../../src/hooks/useGitEditors";
import { GitEditorWorkspace } from "../../src/components/git/GitEditorWorkspace";
import "../../src/i18n";
import "../../src/index.css";
import "../../src/components/git/git.css";
const sha = "a".repeat(40);
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (command: string) => {
      if (command === "get_project_git_graph")
        return { commits: [], has_more: false };
      if (command === "get_project_git_commit_diff")
        return "@@ -1 +1 @@\n-old\n+new\n";
      throw new Error(`Unsupported fixture command: ${command}`);
    },
  },
});
const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
const scale = params.get("scale") === "1.25" ? "1.25" : "1";
document.documentElement.style.zoom = scale;
document.documentElement.style.setProperty("--app-scale", scale);
export function Preview() {
  const editors = useGitEditors("demo");
  return (
    <div className="flex h-screen flex-col bg-background text-primary">
      <div className="flex gap-4 p-2 text-xs">
        <button onClick={editors.openGraph}>Open Graph</button>
        <button
          onClick={() => editors.openFile({ sha, path: "src/example.yaml" })}
        >
          Open Diff
        </button>
        <button
          onClick={() =>
            editors.openFile({ sha, path: "src/example.yaml", view: "working" })
          }
        >
          Compare Working
        </button>
      </div>
      <GitEditorWorkspace
        target={{ projectId: "demo", worktreePath: "/workspace/demo" }}
        editors={editors}
        revision={0}
        files={[]}
        busy={false}
        fetching={false}
        onFetch={() => {}}
        onRefresh={() => {}}
      >
        {null}
      </GitEditorWorkspace>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
