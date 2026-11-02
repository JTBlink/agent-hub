import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { WorktreeExplorer } from "../../src/components/worktree/WorktreeExplorer";
import type {
  WorktreeFileEntry,
  WorktreeFileAction,
} from "../../src/lib/worktreeApi";
import "../../src/i18n";
import "../../src/index.css";

// Synthetic file operations only; this fixture never touches the local filesystem.
const entries: WorktreeFileEntry[] = [
  { name: "src", path: "src", is_dir: true, is_symlink: false },
  { name: "notes.md", path: "src/notes.md", is_dir: false, is_symlink: false },
  { name: "README.md", path: "README.md", is_dir: false, is_symlink: false },
];
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (
      command: string,
      args: { relativePath?: string; action?: WorktreeFileAction },
    ) => {
      const path = args.relativePath ?? "";
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
  return (
    <main className="flex h-screen bg-background text-primary">
      <div className="w-60 overflow-auto border-r border-border">
        <WorktreeExplorer
          projectId="demo"
          worktreePath="/workspace/demo"
          selected={selected}
          onSelect={setSelected}
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
createRoot(document.getElementById("root")!).render(<Fixture />);
