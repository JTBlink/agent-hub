import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, useContext } from "react";
import { FileCode2, GitBranch, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ResizableSidebar } from "../components/ResizableSidebar";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { useApp } from "../context/AppContext";
import { useProjectWorktrees } from "../hooks/useProjectWorktrees";
import {
  commitProjectGit,
  setProjectGitStaged,
  getProjectGitDiff,
  getProjectGitStatus,
  type GitStatus,
} from "../lib/gitApi";
import { worktreeLabel } from "../lib/worktreeApi";
import { getErrorMessage } from "../lib/error";
import { ThemedSelect } from "../components/ThemedSelect";
import { FileContent } from "../components/file-reader/FileContent";
import { WorktreeFilePreview } from "../components/worktree/WorktreeFilePreview";
import { cn } from "../utils";
import { GitChanges, type GitSelection } from "../components/git/GitChanges";
import { GitHistory } from "../components/git/GitHistory";
import { GitCommitForm } from "../components/git/GitCommitForm";
import { GitDiffViewer } from "../components/git/GitDiffViewer";
import { TaskFilterGroup } from "../components/tasks/TaskFilterGroup";
import "../components/git/git.css";

export function Git() {
  const { t } = useTranslation();
  const { projects } = useApp();
  const sidebarVisibility = useContext(SidebarVisibilityContext);
  const [projectId, setProjectId] = useState("");
  const activeId = projects.some((project) => project.id === projectId)
    ? projectId
    : projects[0]?.id;
  const project = projects.find((project) => project.id === activeId);
  const { worktrees } = useProjectWorktrees(activeId);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const root = activeId ? (paths[activeId] ?? project?.path) : undefined;
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<GitSelection>();
  const [split, setSplit] = useState(true);
  const [actionType, setActionType] = useState<"stage" | "commit">();
  const busy = actionType !== undefined;
  const actionLock = useRef(false);
  const changesRef = useRef<HTMLElement>(null);
  const [actionError, setActionError] = useState<string>();
  const [fileView, setFileView] = useState(false);
  const scope = JSON.stringify([activeId, root]);
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setSelection(undefined);
    setFileView(false);
    setActionError(undefined);
  }
  const statusKey = JSON.stringify([scope, revision]);
  const [statusResult, setStatusResult] = useState<{
    key: string;
    scope: string;
    data?: GitStatus;
    error?: string;
  }>();
  const status = statusResult?.scope === scope ? statusResult.data : undefined;
  const error =
    statusResult?.key === statusKey ? statusResult.error : undefined;
  const loading = !!activeId && statusResult?.key !== statusKey;
  const diffKey = JSON.stringify([scope, selection, revision]);
  const [diffResult, setDiffResult] = useState<{
    key: string;
    content?: string;
    error?: string;
  }>();
  const diff = diffResult?.key === diffKey ? diffResult.content : undefined;
  const diffError = diffResult?.key === diffKey ? diffResult.error : undefined;
  const refresh = useCallback(
    () => setRevision((value) => value + 1),
    [setRevision],
  );
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void getProjectGitStatus(activeId, root).then(
      (data) => {
        if (!cancelled) setStatusResult({ key: statusKey, scope, data });
      },
      (cause) => {
        if (!cancelled)
          setStatusResult({
            key: statusKey,
            scope,
            error: getErrorMessage(cause, t("common.error")),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeId, root, scope, statusKey, t]);
  useEffect(() => {
    window.addEventListener("worktree-file-saved", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("worktree-file-saved", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (!activeId || !selection || fileView) return;
    let cancelled = false;
    void getProjectGitDiff(
      activeId,
      root,
      selection.path,
      selection.staged,
    ).then(
      (content) => {
        if (!cancelled) setDiffResult({ key: diffKey, content });
      },
      (cause) => {
        if (!cancelled)
          setDiffResult({
            key: diffKey,
            error: getErrorMessage(cause, t("common.error")),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeId, root, selection, fileView, diffKey, t]);
  const files = status?.files ?? [];
  const stagedFiles = files.filter((file) => file.staged);
  const unstagedFiles = files.filter(
    (file) => file.unstaged || file.conflicted,
  );
  const branch = status?.branch ?? status?.head?.slice(0, 8) ?? t("git.unborn");
  async function runAction(
    action: () => Promise<void>,
    type: "stage" | "commit" = "stage",
  ) {
    if (actionLock.current) return false;
    actionLock.current = true;
    setActionType(type);
    setActionError(undefined);
    try {
      await action();
      refresh();
      return true;
    } catch (cause) {
      setActionError(getErrorMessage(cause, t("common.error")));
      refresh();
      return false;
    } finally {
      actionLock.current = false;
      setActionType(undefined);
    }
  }
  // A refresh may move a file between groups or remove it after a commit.
  useEffect(() => {
    if (
      status &&
      selection &&
      !status.files.some(
        (file) =>
          file.path === selection.path &&
          (selection.staged ? file.staged : file.unstaged || file.conflicted),
      )
    ) {
      setSelection(undefined);
      setFileView(false);
    }
  }, [status, selection]);
  const changeProps = {
    selection,
    busy: busy || loading,
    batchLimited: !!status?.truncated,
    onSelect: (next: GitSelection) => {
      setSelection(next);
      setFileView(false);
    },
    onStage: (paths: string[], staged: boolean) => {
      if (activeId)
        void runAction(() =>
          setProjectGitStaged(activeId, root, paths, staged),
        );
    },
  };
  const statusBar = (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-xs text-muted">
      <span className="flex min-w-0 items-center gap-1" title={branch}>
        <GitBranch size={12} className="shrink-0" />
        <span className="max-w-[200px] truncate">{branch}</span>
      </span>
      {status?.upstream && (
        <span className="max-w-[220px] truncate" title={status.upstream}>
          {status.upstream}
        </span>
      )}
      {status?.ahead != null && (
        <span title={t("git.cachedRefs")}>
          ↑ {status.ahead} ↓ {status.behind}
        </span>
      )}
      {status && status.state !== "Clean" && (
        <span className="text-danger" title={t("git.operation")}>
          {status.state}
        </span>
      )}
      <span className="ml-auto" title={t("git.cachedRefs")}>
        {t("git.localRefs")}
      </span>
    </div>
  );
  const sidebar = (
    <ResizableSidebar
      storageKey="agent-hub:sidebar-width"
      label={t("git.sourceControl")}
      reserveWidth={360}
      hidden={sidebarVisibility?.resourcePanelVisible}
      className="git-sidebar workbench-sidebar-panel mr-1"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 rounded-t-md border-b border-border-subtle bg-bg-secondary px-3 py-2">
        <GitBranch size={16} className="shrink-0 text-accent-light" />
        <h1 className="mr-auto text-xs font-semibold">
          {t("git.sourceControl")}
        </h1>
        <button
          type="button"
          className="app-button-ghost ml-auto h-7 w-7 p-0"
          aria-label={t("settings.refresh")}
          title={t("settings.refresh")}
          disabled={loading || busy}
          onClick={refresh}
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
        </button>
        <div className="w-full">
          <ThemedSelect
            aria-label={t("tasks.project")}
            value={activeId ?? ""}
            disabled={busy}
            className="h-7 w-full py-0 text-xs"
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </ThemedSelect>
        </div>
        <div className="w-full">
          <ThemedSelect
            aria-label={t("git.worktree")}
            value={root ?? ""}
            disabled={busy}
            className="h-7 w-full py-0 text-xs"
            onChange={(event) =>
              activeId &&
              setPaths((previous) => ({
                ...previous,
                [activeId]: event.target.value,
              }))
            }
          >
            {!worktrees.length && root && (
              <option value={root}>{project?.name}</option>
            )}
            {worktrees.map((worktree) => (
              <option key={worktree.path} value={worktree.path}>
                {worktreeLabel(worktree)}
              </option>
            ))}
          </ThemedSelect>
        </div>
      </header>
      <aside
        ref={changesRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-md bg-bg-secondary"
        aria-label={t("git.sourceControl")}
      >
        <div className="flex items-center gap-1.5 px-3 pt-3 text-xs text-secondary">
          <GitBranch size={13} className="shrink-0 text-accent-light" />
          <span title={branch} className="min-w-0 flex-1 truncate font-medium">
            {branch}
          </span>
          <span
            title={t("git.changes")}
            className="rounded-full bg-surface-active px-1.5 font-mono tabular-nums"
          >
            {files.length}
          </span>
        </div>
        <GitCommitForm
          key={`${scope}:commit`}
          branch={branch}
          busy={busy}
          committing={actionType === "commit"}
          enabled={
            !!status &&
            !loading &&
            !status.truncated &&
            stagedFiles.length > 0 &&
            !files.some((file) => file.conflicted) &&
            status.state === "Clean"
          }
          onCommit={(message) =>
            activeId
              ? runAction(
                  () => commitProjectGit(activeId, root, message),
                  "commit",
                )
              : Promise.resolve(false)
          }
        />
        {loading && (
          <p role="status" className="px-3 pb-3 text-xs text-muted">
            {t("common.loading")}
          </p>
        )}
        {status && (
          <div className="pb-4">
            <GitChanges
              key={`${scope}:staged`}
              {...changeProps}
              staged
              files={stagedFiles}
            />
            <GitChanges
              key={`${scope}:unstaged`}
              {...changeProps}
              staged={false}
              files={unstagedFiles}
            />
            {status.truncated && (
              <p className="p-3 text-xs text-muted">{t("git.truncated")}</p>
            )}
          </div>
        )}
        <GitHistory key={`${scope}:history`} commits={status?.commits ?? []} />
      </aside>
    </ResizableSidebar>
  );
  return (
    <>
      {sidebarVisibility?.statusContainer &&
        createPortal(statusBar, sidebarVisibility.statusContainer)}
      {sidebarVisibility?.sidebarContainer &&
        createPortal(sidebar, sidebarVisibility.sidebarContainer)}
      <div className="git-panel flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {!activeId ? (
          <>
            {!sidebarVisibility?.sidebarContainer && sidebar}
            <p className="p-8 text-sm text-muted">{t("terminal.noProjects")}</p>
          </>
        ) : (
          <>
            {(error || actionError) && (
              <p
                role="alert"
                className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-danger-bg px-3 py-2 text-xs text-danger"
              >
                {actionError || error}
                <button
                  type="button"
                  disabled={loading || busy}
                  className="app-button-ghost ml-auto px-2"
                  onClick={() => {
                    setActionError(undefined);
                    refresh();
                  }}
                >
                  {t("common.retry")}
                </button>
              </p>
            )}
            <div className="git-workbench min-h-0 flex-1 overflow-hidden">
              {!sidebarVisibility?.sidebarContainer && sidebar}

              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                {selection ? (
                  <>
                    <div className="flex shrink-0 items-center border-b border-border-subtle bg-bg-secondary">
                      <div className="flex min-w-0 items-center gap-2 border-r border-border-subtle border-t-2 border-t-accent bg-background px-3 py-2 text-xs">
                        <FileCode2
                          size={14}
                          className="shrink-0 text-accent-light"
                        />
                        <span className="truncate" title={selection.path}>
                          {selection.path.split("/").pop()}
                        </span>
                        <span className="shrink-0 text-muted">
                          {t(selection.staged ? "git.staged" : "git.unstaged")}
                        </span>
                        <button
                          type="button"
                          aria-label={t("common.close")}
                          title={t("common.close")}
                          className="app-button-ghost h-5 w-5 shrink-0 p-0"
                          onClick={() => {
                            changesRef.current
                              ?.querySelector<HTMLButtonElement>(
                                'button[aria-current="true"]',
                              )
                              ?.focus();
                            setSelection(undefined);
                            setFileView(false);
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-xs">
                      <span
                        className="mr-auto min-w-0 truncate text-muted"
                        title={selection.path}
                      >
                        {selection.path}
                      </span>
                      {!fileView && (
                        <TaskFilterGroup
                          label={t("git.diffLayout")}
                          value={split ? "split" : "unified"}
                          options={[
                            { value: "split", label: t("git.split") },
                            { value: "unified", label: t("git.unified") },
                          ]}
                          onChange={(value) => setSplit(value === "split")}
                        />
                      )}
                      <button
                        type="button"
                        className={cn(
                          "app-button-ghost px-2 py-1",
                          !fileView && "bg-surface-active",
                        )}
                        onClick={() => setFileView(false)}
                      >
                        {t("git.diff")}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "app-button-ghost px-2 py-1",
                          fileView && "bg-surface-active",
                        )}
                        disabled={
                          files.find((file) => file.path === selection.path)
                            ?.status === "deleted"
                        }
                        onClick={() => setFileView(true)}
                      >
                        {t("git.file")}
                      </button>
                    </div>
                    {fileView && root ? (
                      <WorktreeFilePreview
                        key={`${activeId}:${root}:${selection.path}`}
                        projectId={activeId}
                        worktreePath={root}
                        path={selection.path}
                      />
                    ) : diff !== undefined ? (
                      split ? (
                        <GitDiffViewer patch={diff} staged={selection.staged} />
                      ) : (
                        <FileContent
                          file={{
                            path: `${selection.path}.diff`,
                            content: diff || t("git.noDiff"),
                          }}
                        />
                      )
                    ) : (
                      <p role="status" className="p-6 text-xs text-muted">
                        {diffError || t("common.loading")}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted">
                    <GitBranch
                      size={40}
                      strokeWidth={1}
                      className="text-faint"
                    />
                    <p className="text-sm text-secondary">
                      {t("git.chooseFile")}
                    </p>
                    <p className="text-xs">{t("git.reviewHint")}</p>
                  </div>
                )}
              </section>
            </div>
            {!sidebarVisibility?.statusContainer && statusBar}
          </>
        )}
      </div>
    </>
  );
}
