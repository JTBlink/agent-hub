import { useEffect, useState } from "react";
import {
  ChevronRight,
  FileCode2,
  Folder,
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

interface Props {
  projectId: string;
  worktreePath: string;
  selected?: string;
  onSelect: (path: string) => void;
}

export function WorktreeExplorer(props: Props) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  return (
    <aside
      aria-label={t("fileReader.explorer")}
      className="flex w-[240px] min-w-[150px] max-w-[35%] shrink-0 flex-col border-l border-border-subtle bg-bg-secondary"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-secondary">
          {t("fileReader.explorer")}
        </span>
        <button
          type="button"
          aria-label={t("worktree.refreshFiles")}
          title={t("worktree.refreshFiles")}
          className="app-button-ghost h-6 w-6 p-0"
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <Directory
          key={`${props.projectId}:${props.worktreePath}:${revision}`}
          {...props}
          path=""
        />
      </div>
    </aside>
  );
}

function Directory({ path, ...props }: Props & { path: string }) {
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
    <ul className="space-y-0.5">
      {files.map((file) => (
        <li key={file.path}>
          {file.is_dir ? (
            <FolderEntry {...props} file={file} />
          ) : (
            <button
              type="button"
              disabled={file.is_symlink}
              title={file.is_symlink ? t("worktree.symlink") : file.path}
              aria-pressed={props.selected === file.path}
              onClick={() => props.onSelect(file.path)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40",
                props.selected === file.path
                  ? "bg-surface-active text-primary"
                  : "text-secondary hover:bg-surface-hover",
              )}
            >
              {file.is_symlink ? (
                <Link2 size={13} className="ml-4 shrink-0 text-muted" />
              ) : (
                <FileCode2 size={13} className="ml-4 shrink-0 text-muted" />
              )}
              <span className="truncate">{file.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function FolderEntry({ file, ...props }: Props & { file: WorktreeFileEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        title={file.path}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0", open && "rotate-90")}
        />
        <Folder size={13} className="shrink-0 text-muted" />
        <span className="truncate">{file.name}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border-subtle pl-1">
          <Directory {...props} path={file.path} />
        </div>
      )}
    </>
  );
}
