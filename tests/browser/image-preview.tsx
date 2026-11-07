import { createRoot } from "react-dom/client";
import { useState } from "react";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle("dark", !params.has("light"));
applyTextSize(params.has("large") ? 18 : 14);
const calls: unknown[] = [];
Object.assign(window, {
  imagePreviewCalls: calls,
  __TAURI_INTERNALS__: {
    invoke: async (
      command: string,
      args?: { revision?: string; path?: string },
    ) => {
      if (command !== "read_project_image") return null;
      calls.push(args);
      if (args?.path === "broken.png")
        return new TextEncoder().encode("bad").buffer;
      if (args?.path === "new.svg" && args.revision === "index")
        return new ArrayBuffer(0);
      const updated = args?.revision === "working";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640"><rect x="64" y="64" width="896" height="512" rx="64" fill="${updated ? "#89b4fa" : "#a6e3a1"}"/><text x="512" y="340" text-anchor="middle" font-size="80" fill="#1e1e2e">${updated ? "Modified" : "Original"}</text></svg>`;
      return new TextEncoder().encode(svg).buffer;
    },
  },
});
const { i18nReady, default: i18n } = await import("../../src/i18n");
await i18nReady;
await i18n.changeLanguage("en");
const { GitFileEditor } =
  await import("../../src/components/git/GitFileEditor");
const { WorktreeFilePreview } =
  await import("../../src/components/worktree/WorktreeFilePreview");
export function Acceptance() {
  const [path, setPath] = useState("changed.svg");
  const [file, setFile] = useState(params.has("file"));
  return (
    <main className="flex h-screen flex-col bg-background text-primary">
      <nav className="flex gap-2 border-b border-border p-2 text-sm">
        {["changed.svg", "new.svg", "broken.png"].map((name) => (
          <button
            key={name}
            className="app-button-ghost"
            onClick={() => setPath(name)}
          >
            {name}
          </button>
        ))}
        <button className="app-button-ghost" onClick={() => setFile(!file)}>
          Toggle file tree
        </button>
      </nav>
      {file ? (
        <WorktreeFilePreview
          projectId="demo"
          worktreePath="/workspace"
          path={path}
        />
      ) : (
        <GitFileEditor
          activeId="demo"
          root="/workspace"
          selection={{ path, staged: false }}
          files={[]}
          fileView={false}
          onClose={() => {}}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Acceptance />);
