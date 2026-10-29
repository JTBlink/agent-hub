import { useState } from "react";
import { ChevronRight, FileCode2, Folder, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationScriptFile } from "../lib/tauri";
import { cn } from "../utils";

type FileNode = {
  name: string;
  path: string;
  children: FileNode[];
  file?: AutomationScriptFile;
};

function fileTree(files: AutomationScriptFile[]) {
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
  return roots;
}

function FileList({
  nodes,
  selected,
  onSelect,
}: {
  nodes: FileNode[];
  selected: string | null;
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
              aria-pressed={selected === node.path}
              onClick={() => onSelect(node.path)}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] focus-visible:ring-2 focus-visible:ring-accent",
                selected === node.path
                  ? "bg-surface-active text-accent-light"
                  : "text-secondary hover:bg-surface-hover",
              )}
            >
              <FileCode2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
          ) : (
            <details open className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 group-open:rotate-90"
                />
                <Folder
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted"
                />
                <span title={node.path} className="truncate">
                  {node.name}
                </span>
              </summary>
              <div className="ml-4 border-l border-border-subtle pl-2">
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

export function AutomationScriptFilesEditor({
  files,
  disabled,
  onChange,
}: {
  files: AutomationScriptFile[];
  disabled: boolean;
  onChange: (files: AutomationScriptFile[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const file = files.find((value) => value.path === selected);
  if (!files.length) return null;
  return (
    <details className="rounded-lg border border-border-subtle bg-surface p-4">
      <summary className="cursor-pointer text-[13px] font-medium text-primary focus-visible:ring-2 focus-visible:ring-accent">
        {t("automation.scriptFiles", { count: files.length })}
      </summary>
      <p className="my-3 text-[12px] leading-6 text-muted">
        {t("automation.scriptFilesHint")}
      </p>
      <FileList
        nodes={fileTree(files)}
        selected={file?.path ?? null}
        onSelect={setSelected}
      />
      {file && (
        <div className="mt-3 overflow-hidden rounded-lg border border-border-subtle">
          <div className="flex min-w-0 items-center justify-between gap-2 bg-bg-secondary px-3 py-2">
            <span
              title={file.path}
              className="truncate font-mono text-[12px] text-secondary"
            >
              {file.path}
            </span>
            <button
              type="button"
              aria-label={t("automation.closeFile")}
              title={t("automation.closeFile")}
              onClick={() => setSelected(null)}
              className="app-button-ghost shrink-0 rounded p-1 text-muted focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            aria-label={file.path}
            disabled={disabled}
            required
            value={file.content}
            maxLength={65536}
            onChange={(event) =>
              onChange(
                files.map((value) =>
                  value.path === file.path
                    ? { ...value, content: event.target.value }
                    : value,
                ),
              )
            }
            className="app-input block h-[220px] max-h-[320px] min-h-[120px] w-full resize-y border-0 p-3 font-mono text-[12px] leading-6"
          />
        </div>
      )}
    </details>
  );
}
