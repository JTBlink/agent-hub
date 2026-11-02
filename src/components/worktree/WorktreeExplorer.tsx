import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FileCode2,
  CopyMinus,
  Link2,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getWorktreeFiles,
  type WorktreeFileEntry,
} from "../../lib/worktreeApi";
import { getErrorMessage } from "../../lib/error";
import { cn } from "../../utils";
import type { GitFile } from "../../lib/gitApi";
import {
  worktreeDecorations,
  type WorktreeDecoration,
} from "../../lib/worktreeDecorations";

interface Props {
  projectId: string;
  worktreePath: string;
  selected?: string;
  onSelect: (path: string) => void;
  gitFiles?: readonly GitFile[];
}

type TreeProps = Props & {
  decorations: ReadonlyMap<string, WorktreeDecoration>;
};

export function WorktreeExplorer(props: Props) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  const [collapse, setCollapse] = useState(0);
  const [open, setOpen] = useState(true);
  const decorations = useMemo(
    () => worktreeDecorations(props.gitFiles ?? []),
    [props.gitFiles],
  );
  const rootName =
    props.worktreePath
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) || props.worktreePath;
  return (
    <aside
      aria-label={t("fileReader.explorer")}
      className="flex min-h-0 flex-col bg-bg-secondary"
    >
      <div className="group flex h-7 shrink-0 items-center pr-1">
        <button
          type="button"
          aria-expanded={open}
          title={rootName}
          onClick={() => setOpen(!open)}
          className="flex h-full min-w-0 flex-1 items-center gap-1 px-2 text-left text-sm font-semibold text-primary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <ChevronRight
            size={14}
            className={cn("shrink-0", open && "rotate-90")}
          />
          <span className="truncate">{rootName}</span>
        </button>
        <button
          type="button"
          aria-label={t("worktree.refreshFiles")}
          title={t("worktree.refreshFiles")}
          className="app-button-ghost h-6 w-6 p-0"
          onClick={() => {
            setRevision((value) => value + 1);
            window.dispatchEvent(new Event("project-git-changed"));
          }}
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          aria-label={t("worktree.collapseFiles")}
          title={t("worktree.collapseFiles")}
          className="app-button-ghost h-6 w-6 p-0"
          onClick={() => setCollapse((value) => value + 1)}
        >
          <CopyMinus size={14} />
        </button>
      </div>
      <div hidden={!open} className="min-h-0 flex-1 overflow-auto pb-2">
        <Directory
          key={`${props.projectId}:${props.worktreePath}:${revision}`}
          {...props}
          path=""
          depth={0}
          collapse={collapse}
          decorations={decorations}
        />
      </div>
    </aside>
  );
}

function Directory({
  path,
  depth,
  collapse,
  ...props
}: TreeProps & { path: string; depth: number; collapse: number }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<WorktreeFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getWorktreeFiles(props.projectId, props.worktreePath, path)
      .then(
        (entries) => {
          if (!cancelled) {
            setFiles(entries);
            setError("");
          }
        },
        (cause) => {
          if (!cancelled) setError(getErrorMessage(cause, t("common.error")));
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.projectId, props.worktreePath, path, attempt, t]);
  if (loading)
    return (
      <p role="status" className="px-2 py-1.5 text-xs text-muted">
        {t("common.loading")}
      </p>
    );
  if (error)
    return (
      <div role="alert" className="px-2 py-1.5 text-xs text-danger">
        <p className="break-words">{error}</p>
        <button
          type="button"
          className="app-button-ghost mt-1"
          onClick={() => {
            setLoading(true);
            setAttempt(attempt + 1);
          }}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  if (!files.length)
    return (
      <p className="px-2 py-1.5 text-xs text-muted">
        {t("worktree.emptyDirectory")}
      </p>
    );
  return (
    <ul>
      {files.map((file) => {
        const decoration = props.decorations.get(file.path);
        return (
          <li key={file.path}>
            {file.is_dir ? (
              <FolderEntry
                {...props}
                file={file}
                depth={depth}
                collapse={collapse}
              />
            ) : (
              <button
                type="button"
                disabled={file.is_symlink}
                title={file.is_symlink ? t("worktree.symlink") : file.path}
                aria-pressed={props.selected === file.path}
                onClick={() => props.onSelect(file.path)}
                style={{ paddingLeft: 28 + depth * 12 }}
                className={cn(
                  "flex h-5 w-full min-w-0 items-center gap-1 pr-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-40",
                  props.selected === file.path
                    ? "bg-surface-active"
                    : "hover:bg-surface-hover",
                  decoration?.color ??
                    (props.selected === file.path
                      ? "text-primary"
                      : "text-secondary"),
                )}
              >
                {file.is_symlink ? (
                  <Link2 size={13} className="shrink-0 text-muted" />
                ) : (
                  <FileCode2 size={13} className="shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                {decoration && (
                  <span
                    title={t(`git.states.${decoration.status}`)}
                    aria-label={t(`git.states.${decoration.status}`)}
                    className="w-4 shrink-0 text-center font-mono text-xs"
                  >
                    {decoration.marker}
                  </span>
                )}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FolderEntry({
  file,
  depth,
  collapse,
  ...props
}: TreeProps & { file: WorktreeFileEntry; depth: number; collapse: number }) {
  const { t } = useTranslation();
  const decoration = props.decorations.get(file.path);
  const [open, setOpen] = useState(false);
  const [previousCollapse, setPreviousCollapse] = useState(collapse);
  if (previousCollapse !== collapse) {
    setPreviousCollapse(collapse);
    setOpen(false);
  }
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        title={file.path}
        onClick={() => setOpen(!open)}
        style={{ paddingLeft: 12 + depth * 12 }}
        className={cn(
          "flex h-5 w-full min-w-0 items-center gap-1 pr-2 text-left text-sm hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
          decoration?.color ?? "text-secondary",
        )}
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0", open && "rotate-90")}
        />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        {decoration && (
          <span
            title={t("git.changedFiles", { count: decoration.count })}
            aria-label={t("git.changedFiles", { count: decoration.count })}
            className="flex w-4 shrink-0 justify-center"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-current"
            />
          </span>
        )}
      </button>
      {open && (
        <Directory
          {...props}
          path={file.path}
          depth={depth + 1}
          collapse={collapse}
        />
      )}
    </>
  );
}
