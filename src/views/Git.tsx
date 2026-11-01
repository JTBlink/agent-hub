import { useCallback, useEffect, useState } from "react";
import { GitBranch, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { useProjectWorktrees } from "../hooks/useProjectWorktrees";
import {
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

export function Git() {
  const { t } = useTranslation();
  const { projects } = useApp();
  const [projectId, setProjectId] = useState("");
  const activeId = projects.some((project) => project.id === projectId)
    ? projectId
    : projects[0]?.id;
  const project = projects.find((project) => project.id === activeId);
  const { worktrees } = useProjectWorktrees(activeId);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const root = activeId ? (paths[activeId] ?? project?.path) : undefined;
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<{
    path: string;
    staged: boolean;
  }>();
  const [fileView, setFileView] = useState(false);
  const scope = JSON.stringify([activeId, root]);
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setSelection(undefined);
    setFileView(false);
  }
  const statusKey = JSON.stringify([scope, revision]);
  const [statusResult, setStatusResult] = useState<{
    key: string;
    data?: GitStatus;
    error?: string;
  }>();
  const status =
    statusResult?.key === statusKey ? statusResult.data : undefined;
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
        if (!cancelled) setStatusResult({ key: statusKey, data });
      },
      (cause) => {
        if (!cancelled)
          setStatusResult({
            key: statusKey,
            error: getErrorMessage(cause, t("common.error")),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeId, root, statusKey, t]);
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
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-base font-semibold">Git</h1>
        <ThemedSelect
          aria-label={t("tasks.project")}
          value={activeId ?? ""}
          className="h-8 w-[180px] py-0 text-xs"
          onChange={(event) => setProjectId(event.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </ThemedSelect>
        <ThemedSelect
          aria-label={t("git.worktree")}
          value={root ?? ""}
          className="h-8 w-[230px] py-0 text-xs"
          onChange={(event) =>
            activeId &&
            setPaths((previous) => ({
              ...previous,
              [activeId]: event.target.value,
            }))
          }
        >
          {worktrees.map((worktree) => (
            <option key={worktree.path} value={worktree.path}>
              {worktreeLabel(worktree)}
            </option>
          ))}
        </ThemedSelect>
        <button
          type="button"
          className="app-button-ghost ml-auto h-8 w-8 p-0"
          aria-label={t("settings.refresh")}
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCw size={15} />
        </button>
      </header>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {status && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <GitBranch size={14} />
          <span className="font-medium text-secondary">
            {status.branch ?? status.head?.slice(0, 8) ?? t("git.unborn")}
          </span>
          {status.upstream && <span>{status.upstream}</span>}
          {status.ahead != null && (
            <span>
              ↑ {status.ahead} / ↓ {status.behind}
            </span>
          )}
          {status.state !== "Clean" && (
            <span title={t("git.operation")}>{status.state}</span>
          )}
          <span className="ml-auto text-[11px]">{t("git.cachedRefs")}</span>
        </div>
      )}
      {!activeId && (
        <p className="p-8 text-sm text-muted">{t("terminal.noProjects")}</p>
      )}
      {activeId && (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border-subtle">
          <aside className="w-[30%] min-w-[190px] max-w-[320px] overflow-auto border-r border-border-subtle bg-bg-secondary p-2">
            <h2 className="px-2 py-2 text-xs font-semibold">
              {t("git.changes")} · {status?.files.length ?? 0}
            </h2>
            {!status?.files.length && !loading && !error && (
              <p className="px-2 pb-3 text-xs text-muted">{t("git.clean")}</p>
            )}
            {status?.files.map((file) => (
              <div key={file.path} className="space-y-0.5">
                {[true, false]
                  .filter((staged) =>
                    staged ? file.staged : file.unstaged || file.conflicted,
                  )
                  .map((staged) => (
                    <button
                      type="button"
                      key={String(staged)}
                      title={file.path}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                        selection?.path === file.path &&
                          selection.staged === staged
                          ? "bg-surface-active text-primary"
                          : "text-secondary hover:bg-surface-hover",
                      )}
                      onClick={() => {
                        setSelection({ path: file.path, staged });
                        setFileView(false);
                      }}
                    >
                      <span className="shrink-0 text-[10px] text-muted">
                        {t(staged ? "git.staged" : "git.unstaged")}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {file.path}
                      </span>
                      <span
                        className={cn(
                          "text-[10px]",
                          file.conflicted && "text-danger",
                        )}
                      >
                        {t(`git.states.${file.status}`)}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
            {status?.truncated && (
              <p className="p-2 text-xs text-muted">{t("git.truncated")}</p>
            )}
            <h2 className="mt-3 border-t border-border-subtle px-2 py-2 text-xs font-semibold">
              {t("git.commits")}
            </h2>
            {status?.commits.map((commit) => (
              <div
                key={commit.sha}
                className="space-y-1 border-b border-border-faint px-2 py-2 text-xs"
              >
                <p className="break-words text-secondary">{commit.summary}</p>
                <p
                  className="truncate text-[10px] text-muted"
                  title={commit.sha}
                >
                  {commit.sha.slice(0, 8)} · {commit.author}
                </p>
                <p className="text-[10px] text-faint">
                  {new Date(commit.time * 1000).toLocaleString()}
                </p>
              </div>
            ))}
          </aside>
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selection && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-xs">
                <span
                  title={selection.path}
                  className="mr-auto min-w-0 truncate"
                >
                  {selection.path}
                </span>
                <button
                  type="button"
                  className={cn(
                    "app-button-ghost px-2 py-1",
                    !fileView && "bg-surface-active",
                  )}
                  onClick={() => setFileView(false)}
                >
                  Diff
                </button>
                <button
                  type="button"
                  className={cn(
                    "app-button-ghost px-2 py-1",
                    fileView && "bg-surface-active",
                  )}
                  disabled={
                    status?.files.find((file) => file.path === selection.path)
                      ?.status === "deleted"
                  }
                  onClick={() => setFileView(true)}
                >
                  {t("git.file")}
                </button>
              </div>
            )}
            {selection && fileView && root ? (
              <WorktreeFilePreview
                key={`${activeId}:${root}:${selection.path}`}
                projectId={activeId}
                worktreePath={root}
                path={selection.path}
              />
            ) : diff !== undefined ? (
              <FileContent
                file={{
                  path: `${selection?.path}.diff`,
                  content: diff || t("git.noDiff"),
                }}
              />
            ) : (
              <p role="status" className="p-6 text-xs text-muted">
                {diffError ||
                  (selection || loading
                    ? t("common.loading")
                    : t("git.chooseFile"))}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
