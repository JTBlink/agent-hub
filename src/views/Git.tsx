import { useActiveWorkspace } from "../hooks/useActiveWorkspace";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, useContext } from "react";
import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ResizableSidebar } from "../components/ResizableSidebar";
import { VerticalSplit } from "../components/VerticalSplit";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { useApp } from "../context/AppContext";
import {
  commitProjectGit,
  discardProjectGitChanges,
  setProjectGitStaged,
  getProjectGitDiff,
  getProjectGitCommitDiff,
  getProjectGitStatus,
  type GitStatus,
  runProjectGitAction,
  type GitRepositoryAction,
} from "../lib/gitApi";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { getErrorMessage } from "../lib/error";
import { groupGitChanges } from "../lib/gitChanges";
import { GitChanges, type GitSelection } from "../components/git/GitChanges";
import { GitGraph } from "../components/git/GitGraph";
import { GitHistory } from "../components/git/GitHistory";
import { GitCommitForm } from "../components/git/GitCommitForm";
import { GitStatusBar } from "../components/git/GitStatusBar";
import { GitSourceControlToolbar } from "../components/git/GitSourceControlToolbar";
import { GitBranchDialog } from "../components/git/GitBranchDialog";
import { GitFileEditor } from "../components/git/GitFileEditor";
import "../components/git/git.css";

export function Git() {
  const { t } = useTranslation();
  const { projects } = useApp();
  const sidebarVisibility = useContext(SidebarVisibilityContext);
  const { project, path: root } = useActiveWorkspace(projects);
  const activeId = project?.id;
  const [discardTarget, setDiscardTarget] = useState<{
    projectId: string;
    root?: string;
    paths: string[];
  }>();
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<GitSelection>();
  const [commitSha, setCommitSha] = useState<string>();
  const [graphOpen, setGraphOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [actionType, setActionType] = useState<
    "stage" | "commit" | GitRepositoryAction
  >();
  const [tree, setTree] = useState(true);
  const [branchDialog, setBranchDialog] = useState(false);
  const [actionNotice, setActionNotice] = useState<string>();
  const busy = actionType !== undefined;
  const actionLock = useRef(false);
  const changesRef = useRef<HTMLElement>(null);
  const [actionError, setActionError] = useState<string>();
  const [fileView, setFileView] = useState(false);
  const scope = JSON.stringify([activeId, root]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setGraphOpen(false);
    setSelection(undefined);
    setCommitSha(undefined);
    setFileView(false);
    setActionError(undefined);
    setDiscardTarget(undefined);
    setBranchDialog(false);
    setActionNotice(undefined);
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
  const diffKey = JSON.stringify([scope, selection, commitSha, revision]);
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
    window.addEventListener("project-git-changed", refresh);
    return () => {
      window.removeEventListener("worktree-file-saved", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("project-git-changed", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (!activeId || !selection || fileView) return;
    let cancelled = false;
    const request = commitSha
      ? getProjectGitCommitDiff(activeId, root, commitSha, selection.path)
      : getProjectGitDiff(activeId, root, selection.path, selection.staged);
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
  }, [activeId, root, selection, commitSha, fileView, diffKey, t]);
  const files = status?.files ?? [];
  const { stagedFiles, unstagedFiles } = groupGitChanges(files);
  const branch = status?.branch ?? status?.head?.slice(0, 8) ?? t("git.unborn");
  async function runAction(
    action: () => Promise<void>,
    type: "stage" | "commit" | GitRepositoryAction = "stage",
  ) {
    if (actionLock.current) return false;
    actionLock.current = true;
    setActionType(type);
    setActionError(undefined);
    setActionNotice(undefined);
    const actionScope = scope;
    try {
      await action();
      if (
        currentScope.current === actionScope &&
        ["fetch", "pull", "push", "switch_branch", "create_branch"].includes(
          type,
        )
      )
        setActionNotice(t("git.actions.completed"));
      refresh();
      return true;
    } catch (cause) {
      if (currentScope.current === actionScope)
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
      !commitSha &&
      !status.files.some(
        (file) =>
          file.path === selection.path &&
          (selection.staged ? file.staged : file.unstaged || file.conflicted),
      )
    ) {
      setSelection(undefined);
      setFileView(false);
    }
  }, [status, selection, commitSha]);
  const changeProps = {
    tree,
    selection: commitSha ? undefined : selection,
    busy: busy || loading,
    batchLimited: !!status?.truncated,
    onSelect: (next: GitSelection) => {
      setGraphOpen(false);
      setSelection(next);
      setCommitSha(undefined);
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
                toolbar={(canCommit) => (
                  <GitSourceControlToolbar
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
                    graph={graphOpen}
                    onGraph={() => setGraphOpen(true)}
                    onRemote={(action) => {
                      if (activeId)
                        void runAction(
                          () => runProjectGitAction(activeId, root, action),
                          action,
                        );
                    }}
                    onBranch={() => {
                      setActionError(undefined);
                      setBranchDialog(true);
                    }}
                    onRefresh={refresh}
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
              onRefresh={refresh}
              target={
                activeId
                  ? { projectId: activeId, worktreePath: root }
                  : undefined
              }
              selected={
                commitSha && selection
                  ? { sha: commitSha, path: selection.path }
                  : undefined
              }
              onSelect={({ sha, path }) => {
                setGraphOpen(false);
                setCommitSha(sha);
                setSelection({ path, staged: false });
                setFileView(false);
              }}
            />
          }
        />
      </aside>
    </ResizableSidebar>
  );
  return (
    <>
      {branchDialog && activeId && (
        <GitBranchDialog
          key={scope}
          projectId={activeId}
          worktreePath={root}
          current={branch}
          actionError={actionError}
          onClose={() => setBranchDialog(false)}
          onRun={(action, name) =>
            runAction(
              () => runProjectGitAction(activeId, root, action, name),
              action,
            )
          }
        />
      )}
      <ConfirmDialog
        open={!!discardTarget}
        title={t("git.discardChanges")}
        message={t("git.discardConfirm")}
        details={discardTarget?.paths}
        confirmLabel={t("git.discardChanges")}
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
      >
        {actionError && (
          <p role="alert" className="text-xs text-danger">
            {actionError}
          </p>
        )}
      </ConfirmDialog>

      {sidebarVisibility?.statusContainer &&
        createPortal(statusBar, sidebarVisibility.statusContainer)}
      {sidebarVisibility?.sidebarContainer &&
        createPortal(sidebar, sidebarVisibility.sidebarContainer)}
      <div className="git-panel flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {(actionNotice ||
          (busy && actionType !== "stage" && actionType !== "commit")) && (
          <p
            role="status"
            className="shrink-0 px-3 py-1 text-xs text-secondary"
          >
            {busy ? t("git.actions.running") : actionNotice}
          </p>
        )}
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
                {graphOpen ? (
                  <GitGraph
                    key={scope}
                    target={{ projectId: activeId, worktreePath: root }}
                    revision={revision}
                    changedFiles={files.length}
                    onClose={() => setGraphOpen(false)}
                    onSelect={({ sha, path }) => {
                      setGraphOpen(false);
                      setCommitSha(sha);
                      setSelection({ path, staged: false });
                      setFileView(false);
                    }}
                  />
                ) : selection ? (
                  <GitFileEditor
                    activeId={activeId}
                    root={root}
                    selection={selection}
                    commitSha={commitSha}
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
                      setCommitSha(undefined);
                      setFileView(false);
                    }}
                  />
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
