import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight, CopyMinus, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getWorktreeFiles,
  WORKTREE_FILES_CHANGED,
  type WorktreeFileEntry,
} from "../../lib/worktreeApi";
import { getErrorMessage } from "../../lib/error";
import { cn } from "../../utils";
import type { GitFile } from "../../lib/gitApi";
import {
  WorktreeEntryMenu,
  type WorktreeEntryChange,
} from "./WorktreeEntryMenu";
import {
  worktreeDecorations,
  type WorktreeDecoration,
} from "../../lib/worktreeDecorations";
import { FileTypeIcon } from "../FileTypeIcon";
import { GitStatusIndicator } from "../git/GitStatusIndicator";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";

interface Props {
  checkoutSwitcher?: ReactNode;
  projectId: string;
  worktreePath: string;
  selected?: string;
  onSelect: (path: string) => void;
  gitFiles?: readonly GitFile[];
  onEntryChange?: (change: WorktreeEntryChange) => void;
}

type TreeProps = Props & {
  decorations: ReadonlyMap<string, WorktreeDecoration>;
  revision: number;
  onRefresh: () => void;
  onChanged: (change: WorktreeEntryChange) => void;
};

export function WorktreeExplorer(props: Props) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  const [collapse, setCollapse] = useState(0);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const changed = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      if (
        event.detail?.projectId === props.projectId &&
        event.detail?.worktreePath === props.worktreePath
      ) {
        setRevision((value) => value + 1);
        setOpen(true);
      }
    };
    window.addEventListener(WORKTREE_FILES_CHANGED, changed);
    return () => window.removeEventListener(WORKTREE_FILES_CHANGED, changed);
  }, [props.projectId, props.worktreePath]);
  const refresh = () => {
    setRevision((value) => value + 1);
    window.dispatchEvent(new Event("project-git-changed"));
  };
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
      className="flex min-h-0 flex-1 flex-col bg-bg-secondary"
    >
      <WorktreeEntryMenu
        {...props}
        path=""
        directory
        onRefresh={refresh}
        onChanged={(change) => props.onEntryChange?.(change)}
        onCreated={() => setOpen(true)}
      >
        <div className="group flex h-7 shrink-0 items-center pr-1">
          {props.checkoutSwitcher ? (
            <div className="min-w-0 flex-1">{props.checkoutSwitcher}</div>
          ) : (
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
          )}
          {open && loading && <DirectoryLoading />}
          <button
            type="button"
            aria-label={t("worktree.refreshFiles")}
            title={t("worktree.refreshFiles")}
            className="app-button-ghost h-6 w-6 p-0"
            onClick={refresh}
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
      </WorktreeEntryMenu>
      <div hidden={!open} className="min-h-0 flex-1 overflow-auto pb-2">
        <Directory
          key={`${props.projectId}:${props.worktreePath}`}
          {...props}
          path=""
          onLoadingChange={setLoading}
          depth={0}
          collapse={collapse}
          decorations={decorations}
          revision={revision}
          onRefresh={refresh}
          onChanged={(change) => props.onEntryChange?.(change)}
        />
      </div>
    </aside>
  );
}

function DirectoryLoading() {
  const { t } = useTranslation();
  return (
    <Loader2
      role="status"
      aria-label={t("common.loading")}
      size={13}
      className="shrink-0 animate-spin text-muted"
    />
  );
}

function Directory({
  onLoadingChange,
  path,
  depth,
  collapse,
  ...props
}: TreeProps & {
  path: string;
  depth: number;
  collapse: number;
  onLoadingChange: (loading: boolean) => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<WorktreeFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const describeError = useEffectEvent((cause: unknown) =>
    getErrorMessage(cause, t("common.error")),
  );
  useEffect(() => {
    let cancelled = false;
    onLoadingChange(true);
    getWorktreeFiles(props.projectId, props.worktreePath, path)
      .then(
        (entries) => {
          if (!cancelled) {
            setFiles(entries);
            setError("");
          }
        },
        (cause) => {
          if (!cancelled) {
            setError(describeError(cause));
            if (!path) window.dispatchEvent(new Event("project-git-changed"));
          }
        },
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          onLoadingChange(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.projectId,
    props.worktreePath,
    path,
    props.revision,
    attempt,
    onLoadingChange,
  ]);
  if (loading) return null;
  if (error && !path)
    return (
      <WorkspaceUnavailable
        compact
        path={props.worktreePath}
        loading={loading}
        missing={false}
        onRetry={() => {
          setLoading(true);
          setAttempt(attempt + 1);
        }}
      />
    );
  if (error)
    return (
      <div role="status" className="px-2 py-1.5 text-xs text-muted">
        <p className="break-words">
          {t("worktree.missingDirectory.accessDescription")}
        </p>
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
              <WorktreeEntryMenu
                {...props}
                path={file.path}
                directory={false}
                symlink={file.is_symlink}
              >
                <button
                  type="button"
                  disabled={file.is_symlink}
                  title={file.is_symlink ? t("worktree.symlink") : file.path}
                  aria-description={
                    file.is_ignored ? t("worktree.gitIgnored") : undefined
                  }
                  aria-pressed={props.selected === file.path}
                  onClick={() => props.onSelect(file.path)}
                  style={{ paddingLeft: 28 + depth * 12 }}
                  className={cn(
                    "flex h-[22px] w-full min-w-0 items-center gap-1 pr-2 text-left text-[13px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-40",
                    props.selected === file.path
                      ? "bg-surface-active"
                      : "hover:bg-surface-hover",
                    file.is_ignored
                      ? "text-muted"
                      : (decoration?.color ?? "text-primary"),
                  )}
                >
                  <span className={file.is_ignored ? "opacity-50" : undefined}>
                    <FileTypeIcon path={file.path} symlink={file.is_symlink} />
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={
                      file.is_ignored ? t("worktree.gitIgnored") : undefined
                    }
                  >
                    {file.name}
                  </span>
                  {decoration && <GitStatusIndicator decoration={decoration} />}
                </button>
              </WorktreeEntryMenu>
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
  const [loading, setLoading] = useState(false);
  const [previousCollapse, setPreviousCollapse] = useState(collapse);
  if (previousCollapse !== collapse) {
    setPreviousCollapse(collapse);
    setOpen(false);
  }
  return (
    <>
      <WorktreeEntryMenu
        {...props}
        path={file.path}
        directory
        symlink={file.is_symlink}
        onCreated={() => setOpen(true)}
      >
        <button
          type="button"
          aria-expanded={open}
          title={file.path}
          aria-description={
            file.is_ignored ? t("worktree.gitIgnored") : undefined
          }
          onClick={() => setOpen(!open)}
          style={{ paddingLeft: 12 + depth * 12 }}
          className={cn(
            "flex h-[22px] w-full min-w-0 items-center gap-1 pr-2 text-left text-[13px] hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
            file.is_ignored
              ? "text-muted"
              : (decoration?.color ?? "text-primary"),
          )}
        >
          <ChevronRight
            size={12}
            className={cn("shrink-0", open && "rotate-90")}
          />
          <span className={file.is_ignored ? "opacity-50" : undefined}>
            <FileTypeIcon
              path={file.path}
              directory
              open={open}
              symlink={file.is_symlink}
            />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className="truncate"
              title={file.is_ignored ? t("worktree.gitIgnored") : undefined}
            >
              {file.name}
            </span>
            {open && loading && <DirectoryLoading />}
          </span>
          {decoration && (
            <GitStatusIndicator
              decoration={decoration}
              directory={decoration}
            />
          )}
        </button>
      </WorktreeEntryMenu>
      {open && (
        <Directory
          {...props}
          path={file.path}
          onLoadingChange={setLoading}
          depth={depth + 1}
          collapse={collapse}
        />
      )}
    </>
  );
}
