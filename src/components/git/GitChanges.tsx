import { useId, useState } from "react";
import { ChevronRight, FileCode2, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitFile } from "../../lib/gitApi";
import { cn } from "../../utils";

export interface GitSelection {
  path: string;
  staged: boolean;
}
interface ChangeNode {
  name: string;
  path: string;
  children: ChangeNode[];
  file?: GitFile;
}
function changeTree(files: GitFile[]): ChangeNode[] {
  const roots: ChangeNode[] = [];
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
  const sort = (nodes: ChangeNode[]) => {
    nodes.sort(
      (a, b) =>
        Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name),
    );
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}
const markers: Record<string, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  conflict: "!",
};

type ChangeProps = {
  staged: boolean;
  selection?: GitSelection;
  busy: boolean;
  batchLimited: boolean;
  onSelect: (selection: GitSelection) => void;
  onStage: (paths: string[], staged: boolean) => void;
};
function ChangeTree({
  nodes,
  depth = 0,
  ...props
}: ChangeProps & { nodes: ChangeNode[]; depth?: number }) {
  const { t } = useTranslation();
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.file ? (
            <div
              className={cn(
                "group flex min-w-0 items-center",
                props.selection?.path === node.path &&
                  props.selection.staged === props.staged
                  ? "bg-surface-active"
                  : "hover:bg-surface-hover",
              )}
            >
              <button
                type="button"
                title={node.path}
                aria-label={`${t(props.staged ? "git.staged" : "git.unstaged")}: ${node.path}`}
                aria-current={
                  props.selection?.path === node.path &&
                  props.selection.staged === props.staged
                    ? "true"
                    : undefined
                }
                className="flex h-6 min-w-0 flex-1 items-center gap-1.5 pr-1 text-left text-xs text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                style={{ paddingLeft: 14 + depth * 12 }}
                onClick={() =>
                  props.onSelect({ path: node.path, staged: props.staged })
                }
              >
                <FileCode2 size={14} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                <span
                  title={t(`git.states.${node.file.status}`)}
                  aria-label={t(`git.states.${node.file.status}`)}
                  className={cn(
                    "w-4 shrink-0 text-center font-mono",
                    node.file.conflicted || node.file.status === "deleted"
                      ? "text-danger"
                      : node.file.status === "added"
                        ? "text-[var(--color-brand-teal)]"
                        : "text-[var(--terminal-yellow)]",
                  )}
                >
                  {markers[node.file.status] ?? "M"}
                </span>
              </button>
              <button
                type="button"
                disabled={props.busy}
                title={t(props.staged ? "git.unstageFile" : "git.stageFile")}
                aria-label={`${t(props.staged ? "git.unstageFile" : "git.stageFile")}: ${node.path}`}
                className="app-button-ghost mr-1 h-6 w-6 shrink-0 p-0 text-muted sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                onClick={() => props.onStage([node.path], !props.staged)}
              >
                {props.staged ? <Minus size={14} /> : <Plus size={14} />}
              </button>
            </div>
          ) : (
            <details
              open
              className="[&[open]>summary>svg:first-child]:rotate-90"
            >
              <summary
                title={node.path}
                style={{ paddingLeft: 8 + depth * 12 }}
                className="flex h-6 cursor-pointer list-none items-center gap-1.5 pr-2 text-xs text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
              >
                <ChevronRight size={12} className="shrink-0" />
                <span className="truncate">{node.name}</span>
              </summary>
              <ChangeTree {...props} nodes={node.children} depth={depth + 1} />
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
export function GitChanges({
  files,
  ...props
}: ChangeProps & { files: GitFile[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  if (!files.length && props.staged) return null;
  return (
    <section>
      <div className="group flex h-7 items-center hover:bg-surface-hover">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-left text-xs font-semibold text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronRight
            size={13}
            className={cn("shrink-0", expanded && "rotate-90")}
          />
          <span>{t(props.staged ? "git.stagedChanges" : "git.changes")}</span>
          <span className="ml-auto rounded-full bg-surface-active px-1.5 font-mono text-xs tabular-nums">
            {files.length}
          </span>
        </button>
        <button
          type="button"
          disabled={props.busy || !files.length || props.batchLimited}
          title={t(props.staged ? "git.unstageAll" : "git.stageAll")}
          aria-label={t(props.staged ? "git.unstageAll" : "git.stageAll")}
          className="app-button-ghost mx-1 h-6 w-6 p-0 text-muted sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={() =>
            props.onStage(
              files.map((file) => file.path),
              !props.staged,
            )
          }
        >
          {props.staged ? <Minus size={14} /> : <Plus size={14} />}
        </button>
      </div>
      <div id={id} hidden={!expanded}>
        {files.length ? (
          <ChangeTree {...props} nodes={changeTree(files)} />
        ) : (
          <p className="px-5 py-4 text-xs text-muted">{t("git.clean")}</p>
        )}
      </div>
    </section>
  );
}
