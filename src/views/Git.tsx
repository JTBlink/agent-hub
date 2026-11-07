import { isPreviewableImage } from "../features/image-preview";
import { toast } from "sonner";
import { useActiveWorkspace } from "../hooks/useActiveWorkspace";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { ResizableSidebar } from "../components/ResizableSidebar";
import { VerticalSplit } from "../components/VerticalSplit";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { GitEditorVisibilityContext } from "../hooks/gitEditorVisibility";
import { useApp } from "../context/AppContext";
import {
  commitProjectGit,
  discardProjectGitChanges,
  setProjectGitStaged,
  getProjectGitDiff,
  getProjectGitStatus,
  type GitStatus,
  type GitFile,
  runProjectGitAction,
  type GitRepositoryAction,
} from "../lib/gitApi";
import { GitDiscardDialog } from "../components/git/GitDiscardDialog";
import { GitTagActionsProvider } from "../components/git/GitTagActionsProvider";
import { getErrorMessage } from "../lib/error";
import {
  invalidateProjectGitStatus,
  peekProjectGitStatus,
} from "../lib/projectGitStatus";
import { groupGitChanges } from "../lib/gitChanges";
import { GitChangeFileMenu } from "../components/git/GitChangeFileMenu";
import { GitChanges, type GitSelection } from "../components/git/GitChanges";
import { GitEditorWorkspace } from "../components/git/GitEditorWorkspace";
import { useGitEditors } from "../hooks/useGitEditors";
import { GitHistory } from "../components/git/GitHistory";
import { GitCommitForm } from "../components/git/GitCommitForm";
import { GitStatusBar } from "../components/git/GitStatusBar";
import { GitSourceControlToolbar } from "../components/git/GitSourceControlToolbar";
import { GitBranchMenu } from "../components/git/GitBranchMenu";
import { GitFileEditor } from "../components/git/GitFileEditor";
import "../components/git/git.css";

export function Git() {
  const { t } = useTranslation();
  const { projects, loading: projectsLoading, appError } = useApp();
  const sidebarVisibility = useContext(SidebarVisibilityContext);
  const setGitEditorVisible = useContext(GitEditorVisibilityContext);
  const { project, path: root } = useActiveWorkspace(projects);
  const activeId = project?.id;
  const [discardTarget, setDiscardTarget] = useState<{
    projectId: string;
    root?: string;
    paths: string[];
  }>();
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<GitSelection>();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [actionType, setActionType] = useState<
    "stage" | "commit" | "sync" | "tag" | GitRepositoryAction
  >();
  const [tree, setTree] = useState(true);
  const busy = actionType !== undefined;
  const actionLock = useRef(false);
  const changesRef = useRef<HTMLElement>(null);
  const [actionError, setActionError] = useState<string>();
  const [fileView, setFileView] = useState(false);
  const scope = JSON.stringify([activeId, root]);
  const editors = useGitEditors(scope);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setSelection(undefined);
    setFileView(false);
    setActionError(undefined);
    setDiscardTarget(undefined);
  }
  const statusKey = JSON.stringify([scope, revision]);
  const [statusResult, setStatusResult] = useState<{
    key: string;
    scope: string;
    data?: GitStatus;
    error?: string;
  }>();
  const status =
    statusResult?.scope === scope
      ? statusResult.data
      : activeId
        ? peekProjectGitStatus(activeId, root)
        : undefined;
  const error =
    statusResult?.key === statusKey ? statusResult.error : undefined;
  const loading = !!activeId && statusResult?.key !== statusKey;
  const editorVisible =
    !activeId ||
    editors.graph ||
    editors.files.length > 0 ||
    !!selection ||
    !!error ||
    !!actionError;
  useEffect(() => {
    setGitEditorVisible?.(editorVisible);
    return () => setGitEditorVisible?.(false);
  }, [editorVisible, setGitEditorVisible]);
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
  const requestRefresh = () => {
    if (activeId) invalidateProjectGitStatus(activeId, root);
    refresh();
  };
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
    window.addEventListener("project-git-changed", refresh);
    return () => {
      window.removeEventListener("worktree-file-saved", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("project-git-changed", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (
      !activeId ||
      !selection ||
      fileView ||
      isPreviewableImage(selection.path)
    )
      return;
    let cancelled = false;
    const request = getProjectGitDiff(
      activeId,
      root,
      selection.path,
      selection.staged,
    );
    void request.then(
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
  const { stagedFiles, unstagedFiles } = groupGitChanges(files);
  const branch =
    status?.branch ??
    status?.head?.slice(0, 8) ??
    t(status ? "git.unborn" : "common.loading");
  async function runAction(
    action: () => Promise<void>,
    type: "stage" | "commit" | "sync" | "tag" | GitRepositoryAction = "stage",
  ) {
    if (actionLock.current) return false;
    actionLock.current = true;
    setActionType(type);
    setActionError(undefined);
    const actionScope = scope;
    const noticeId =
      type !== "stage" && type !== "commit"
        ? toast.loading(t("git.actions.running"))
        : undefined;
    let completed = false;
    try {
      await action();
      if (noticeId !== undefined && currentScope.current === actionScope) {
        toast.success(t("git.actions.completed"), { id: noticeId });
        completed = true;
      }
      refresh();
      return true;
    } catch (cause) {
      if (activeId) invalidateProjectGitStatus(activeId, root);
      if (currentScope.current === actionScope)
        setActionError(getErrorMessage(cause, t("common.error")));
      refresh();
      return false;
    } finally {
      if (noticeId !== undefined && !completed) toast.dismiss(noticeId);
      actionLock.current = false;
      setActionType(undefined);
    }
  }
  const syncChanges = () => {
    if (!activeId) return;
    void runAction(async () => {
      await runProjectGitAction(activeId, root, "pull");
      if (currentScope.current !== scope) return;
      await runProjectGitAction(activeId, root, "push");
    }, "sync");
  };
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
    tree,
    selection,
    busy: busy || loading,
    batchLimited: !!status?.truncated,
    onSelect: (next: GitSelection) => {
      editors.select("working");
      setSelection(next);
      setFileView(false);
    },
    onDiscard: (paths: string[]) => {
      setActionError(undefined);
      if (activeId) setDiscardTarget({ projectId: activeId, root, paths });
    },
    onStage: (paths: string[], staged: boolean) => {
      if (activeId)
        void runAction(() =>
          setProjectGitStaged(activeId, root, paths, staged),
        );
    },
  };
  const renderChangeFile =
    (staged: boolean) => (file: GitFile, children: React.ReactNode) => (
      <GitChangeFileMenu
        projectId={activeId!}
        root={root}
        head={status?.head}
        file={file}
        staged={staged}
        busy={changeProps.busy}
        onSelect={changeProps.onSelect}
        onOpenFile={(next) => {
          editors.select("working");
          setSelection(next);
          setFileView(true);
        }}
        onOpenRevision={editors.openFile}
        onStage={changeProps.onStage}
        onDiscard={changeProps.onDiscard}
      >
        {children}
      </GitChangeFileMenu>
    );
  const statusBar = <GitStatusBar branch={branch} status={status} />;
  const sidebar = (
    <ResizableSidebar
      storageKey="agent-hub:sidebar-width"
      label={t("git.sourceControl")}
      reserveWidth={360}
      hidden={sidebarVisibility?.resourcePanelVisible}
      className="git-sidebar workbench-sidebar-panel mr-1"
    >
      <header className="flex h-9 shrink-0 items-center gap-2 bg-bg-secondary px-3">
        <h1 className="mr-auto text-xs font-semibold">
          {t("git.sourceControl")}
        </h1>
      </header>
      <aside
        ref={changesRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md bg-bg-secondary"
        aria-label={t("git.sourceControl")}
      >
        <VerticalSplit
          storageKey="agent-hub:git-sidebar-split"
          label={t("git.resizePanels")}
          hint={t("git.resizePanelsHint")}
          bottomCollapsed={!historyExpanded}
          top={
            <>
              <GitCommitForm
                key={`${scope}:commit`}
                branch={branch}
                busy={busy}
                committing={actionType === "commit"}
                sync={
                  status?.upstream &&
                  files.length === 0 &&
                  ((status.ahead ?? 0) > 0 || (status.behind ?? 0) > 0)
                    ? {
                        ahead: status.ahead ?? 0,
                        behind: status.behind ?? 0,
                        enabled:
                          !loading &&
                          !status.truncated &&
                          !!status.branch &&
                          status.state === "Clean",
                        onSync: syncChanges,
                      }
                    : undefined
                }
                toolbar={(canCommit) => (
                  <GitSourceControlToolbar
                    target={
                      activeId
                        ? { projectId: activeId, worktreePath: root }
                        : undefined
                    }
                    disabled={!status || loading || busy}
                    canSync={
                      !!status?.upstream &&
                      !!status.branch &&
                      status.state === "Clean" &&
                      !files.some((file) => file.conflicted)
                    }
                    canCommit={canCommit}
                    loading={loading || busy}
                    tree={tree}
                    history={historyExpanded}
                    graph={editors.active === "graph"}
                    onGraph={editors.openGraph}
                    onRemote={(action) => {
                      if (activeId)
                        void runAction(
                          () => runProjectGitAction(activeId, root, action),
                          action,
                        );
                    }}
                    branchControl={
                      activeId && (
                        <GitBranchMenu
                          key={scope}
                          projectId={activeId}
                          worktreePath={root}
                          current={branch}
                          label={t("git.actions.branches")}
                          disabled={!status || loading || busy}
                          triggerIcon={
                            <span
                              aria-hidden="true"
                              className="codicon codicon-source-control"
                              style={{ fontSize: 14, lineHeight: 1 }}
                            />
                          }
                          triggerClassName="app-button-ghost h-6 w-6 p-0"
                          onRun={(action, name) =>
                            runAction(
                              () =>
                                runProjectGitAction(
                                  activeId,
                                  root,
                                  action,
                                  name,
                                ),
                              action,
                            )
                          }
                        />
                      )
                    }
                    onRefresh={requestRefresh}
                    onTree={() => setTree((value) => !value)}
                    onHistory={() => setHistoryExpanded((value) => !value)}
                    canStage={!status?.truncated && unstagedFiles.length > 0}
                    canUnstage={!status?.truncated && stagedFiles.length > 0}
                    onStageAll={() =>
                      changeProps.onStage(
                        unstagedFiles.map((file) => file.path),
                        true,
                      )
                    }
                    onUnstageAll={() =>
                      changeProps.onStage(
                        stagedFiles.map((file) => file.path),
                        false,
                      )
                    }
                  />
                )}
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
              {loading && !status && (
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
                    renderFile={renderChangeFile(true)}
                  />
                  <GitChanges
                    key={`${scope}:unstaged`}
                    {...changeProps}
                    staged={false}
                    files={unstagedFiles}
                    renderFile={renderChangeFile(false)}
                  />
                  {status.truncated && (
                    <p className="p-3 text-xs text-muted">
                      {t("git.truncated")}
                    </p>
                  )}
                </div>
              )}
            </>
          }
          bottom={
            <GitHistory
              key={`${scope}:history`}
              status={status}
              loading={loading}
              expanded={historyExpanded}
              onExpandedChange={setHistoryExpanded}
              onRefresh={requestRefresh}
              target={
                activeId
                  ? { projectId: activeId, worktreePath: root }
                  : undefined
              }
              selected={editors.files.find(
                (file) => editors.fileId(file) === editors.active,
              )}
              onSelect={editors.openFile}
            />
          }
        />
      </aside>
    </ResizableSidebar>
  );
  return (
    <GitTagActionsProvider
      key={scope}
      target={
        activeId ? { projectId: activeId, worktreePath: root } : undefined
      }
      busy={busy || loading}
      openGraph={editors.revealGraph}
      refresh={requestRefresh}
      onRun={(operation) => runAction(operation, "tag")}
    >
      <GitDiscardDialog
        paths={discardTarget?.paths}
        error={actionError}
        onClose={() => setDiscardTarget(undefined)}
        onConfirm={async () => {
          if (!discardTarget) return false;
          const success = await runAction(() =>
            discardProjectGitChanges(
              discardTarget.projectId,
              discardTarget.root,
              discardTarget.paths,
            ),
          );
          if (!success) return false;
        }}
      />

      {sidebarVisibility?.statusContainer &&
        createPortal(statusBar, sidebarVisibility.statusContainer)}
      {sidebarVisibility?.sidebarContainer &&
        createPortal(sidebar, sidebarVisibility.sidebarContainer)}
      <div className="git-panel flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {!activeId ? (
          <>
            {!sidebarVisibility?.sidebarContainer && sidebar}
            {projectsLoading ? (
              <p role="status" className="p-8 text-sm text-muted">
                {t("common.loading")}
              </p>
            ) : appError ? (
              <p role="alert" className="p-8 text-sm text-danger">
                {appError}
              </p>
            ) : (
              <p className="p-8 text-sm text-muted">{t("git.noProjects")}</p>
            )}
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
                    requestRefresh();
                  }}
                >
                  {t("common.retry")}
                </button>
              </p>
            )}
            <div className="git-workbench min-h-0 flex-1 overflow-hidden">
              {!sidebarVisibility?.sidebarContainer && sidebar}

              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                <GitEditorWorkspace
                  target={{ projectId: activeId, worktreePath: root }}
                  editors={editors}
                  revision={revision}
                  files={files}
                  busy={busy || loading}
                  fetching={actionType === "fetch"}
                  onFetch={() => {
                    void runAction(
                      () => runProjectGitAction(activeId, root, "fetch"),
                      "fetch",
                    );
                  }}
                  onRefresh={requestRefresh}
                >
                  {selection ? (
                    <GitFileEditor
                      activeId={activeId}
                      root={root}
                      selection={selection}
                      fileView={fileView}
                      diff={diff}
                      diffError={diffError}
                      files={files}
                      onFileViewChange={setFileView}
                      onClose={() => {
                        changesRef.current
                          ?.querySelector<HTMLButtonElement>(
                            'button[aria-current="true"]',
                          )
                          ?.focus();
                        setSelection(undefined);
                        setFileView(false);
                      }}
                    />
                  ) : null}
                </GitEditorWorkspace>
              </section>
            </div>
            {!sidebarVisibility?.statusContainer && statusBar}
          </>
        )}
      </div>
    </GitTagActionsProvider>
  );
}
