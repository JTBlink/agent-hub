import { ChevronRight, FileCode2, Folder } from "lucide-react";
import { cn } from "../../utils";
import type { ReaderFile } from "./types";

interface FileNode {
  name: string;
  path: string;
  children: FileNode[];
  file?: ReaderFile;
}

function fileTree(files: readonly ReaderFile[]): FileNode[] {
  const roots: FileNode[] = [];
  for (const file of files) {
    let siblings = roots;
    const parts = file.path.split("/");
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let node = siblings.find((item) => item.path === path);
      if (!node) {
        node = { name, path, children: [] };
        siblings.push(node);
      }
      if (index === parts.length - 1) node.file = file;
      siblings = node.children;
    });
  }
  const sort = (nodes: FileNode[]): FileNode[] => {
    nodes.forEach((node) => sort(node.children));
    return nodes.sort(
      (a, b) =>
        Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name),
    );
  };
  return sort(roots);
}

function FileList({
  nodes,
  selected,
  onSelect,
}: {
  nodes: FileNode[];
  selected?: string;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.file ? (
            <button
              type="button"
              title={node.path}
              aria-label={node.path}
              aria-current={selected === node.path ? "page" : undefined}
              onClick={() => onSelect(node.path)}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                selected === node.path
                  ? "bg-surface-active text-accent-light"
                  : "text-secondary hover:bg-surface-hover",
              )}
            >
              <FileCode2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
          ) : (
            <details
              open
              className="[&[open]>summary>svg:first-child]:rotate-90"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />
                <Folder
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted"
                />
                <span title={node.path} className="truncate">
                  {node.name}
                </span>
              </summary>
              <div className="ml-3 border-l border-border-subtle pl-1">
                <FileList
                  nodes={node.children}
                  selected={selected}
                  onSelect={onSelect}
                />
              </div>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

export function FileTree({
  files,
  selected,
  onSelect,
}: {
  files: readonly ReaderFile[];
  selected?: string;
  onSelect: (path: string) => void;
}) {
  return (
    <FileList nodes={fileTree(files)} selected={selected} onSelect={onSelect} />
  );
}
