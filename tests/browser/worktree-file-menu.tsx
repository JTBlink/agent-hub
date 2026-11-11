import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { WorkspaceFilesProvider } from "../../src/components/worktree/WorkspaceFilesContext";
import { useWorkspaceFiles } from "../../src/hooks/useWorkspaceFiles";
import { WorktreeOpenEditors } from "../../src/components/worktree/WorktreeOpenEditors";
import { WorktreeExplorer } from "../../src/components/worktree/WorktreeExplorer";
import type {
  WorktreeFileEntry,
  WorktreeFileAction,
} from "../../src/lib/worktreeApi";
import "../../src/i18n";
import "../../src/index.css";

// Local visual checks: ?theme=dark&scale=1.25&width=360 (synthetic data only).
const preview = new URLSearchParams(window.location.search);
document.documentElement.classList.toggle(
  "dark",
  preview.get("theme") === "dark",
);
const previewScale = preview.get("scale") === "1.25" ? "1.25" : "1";
document.documentElement.style.setProperty("--app-scale", previewScale);
document.documentElement.style.zoom = previewScale;

const settingsName = preview.has("long")
  ? "workspace-configuration-with-a-long-name.json"
  : "settings.json";

// Synthetic file operations only; this fixture never touches the local filesystem.
const entries: WorktreeFileEntry[] = [
  {
    name: "cache",
    path: "cache",
    is_dir: true,
    is_symlink: false,
    is_ignored: true,
  },
  {
    name: "output.txt",
    path: "cache/output.txt",
    is_dir: false,
    is_symlink: false,
    is_ignored: true,
  },
  { name: "src", path: "src", is_dir: true, is_symlink: false },
  { name: "notes.md", path: "src/notes.md", is_dir: false, is_symlink: false },
  { name: "README.md", path: "README.md", is_dir: false, is_symlink: false },
  {
    name: settingsName,
    path: settingsName,
    is_dir: false,
    is_symlink: false,
  },
  { name: "review.py", path: "review.py", is_dir: false, is_symlink: false },
];
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (
      command: string,
      args: { relativePath?: string; action?: WorktreeFileAction },
    ) => {
      const path = args.relativePath ?? "";
      if (command === "read_worktree_file") return "Synthetic file content";
      if (command === "get_worktree_files")
        return entries.filter(
          (entry) => entry.path.split("/").slice(0, -1).join("/") === path,
        );
      if (command === "modify_worktree_entry" && args.action) {
        const action = args.action;
        if (action.kind === "new_file" || action.kind === "new_directory") {
          const nextPath = [path, action.name].filter(Boolean).join("/");
          if (entries.some((entry) => entry.path === nextPath))
            throw new Error("Entry already exists");
          entries.push({
            name: action.name,
            path: nextPath,
            is_dir: action.kind === "new_directory",
            is_symlink: false,
          });
          return nextPath;
        }
        const nextPath =
          action.kind === "rename"
            ? [...path.split("/").slice(0, -1), action.name].join("/")
            : path;
        for (let index = entries.length - 1; index >= 0; index--) {
          const entry = entries[index];
          if (entry.path !== path && !entry.path.startsWith(`${path}/`))
            continue;
          if (action.kind === "delete") entries.splice(index, 1);
          else {
            entry.path = nextPath + entry.path.slice(path.length);
            entry.name = entry.path.split("/").at(-1)!;
          }
        }
        return nextPath;
      }
      return null;
    },
  },
});
export function Fixture() {
  const [selected, setSelected] = useState<string>();
  const { setFiles } = useWorkspaceFiles();
  return (
    <main
      className="flex h-screen max-w-full bg-background text-primary"
      style={{ width: preview.get("width") === "360" ? 360 : undefined }}
    >
      <div className="w-60 overflow-auto border-r border-border">
        <WorktreeOpenEditors projectId="demo" worktreePath="/workspace/demo" />
        <WorktreeExplorer
          projectId="demo"
          worktreePath="/workspace/demo"
          gitFiles={[
            {
              path: "README.md",
              status: "modified",
              staged: false,
              unstaged: true,
              conflicted: false,
            },
            {
              path: settingsName,
              status: "added",
              staged: false,
              unstaged: true,
              conflicted: false,
            },
            {
              path: "review.py",
              status: "added",
              staged: true,
              unstaged: false,
              conflicted: false,
            },
            {
              path: "src/notes.md",
              status: "modified",
              staged: false,
              unstaged: true,
              conflicted: true,
            },
            {
              path: "src/removed.txt",
              status: "deleted",
              staged: false,
              unstaged: true,
              conflicted: false,
            },
          ]}
          selected={selected}
          onSelect={(path) => {
            setSelected(path);
            setFiles({
              [JSON.stringify(["demo", "/workspace/demo"])]: {
                path,
                shown: true,
              },
            });
          }}
          onEntryChange={(change) => {
            if (
              selected &&
              (selected === change.path ||
                selected.startsWith(`${change.path}/`))
            ) {
              if (change.kind === "rename")
                setSelected(
                  change.nextPath + selected.slice(change.path.length),
                );
              if (change.kind === "delete") setSelected(undefined);
            }
          }}
        />
      </div>
      <p className="p-4 text-sm" data-selected>
        {selected ?? ""}
      </p>
      <Toaster />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <WorkspaceFilesProvider>
      <Fixture />
    </WorkspaceFilesProvider>
  </MemoryRouter>,
);
