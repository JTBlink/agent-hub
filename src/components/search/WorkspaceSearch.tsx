import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import { useWorktreeSearch } from "../../hooks/useWorktreeSearch";
import { useActiveWorkspace } from "../../hooks/useActiveWorkspace";
import { worktreeLabel, worktreeUrl } from "../../lib/worktreeApi";
import {
  replaceWorktreeMatches,
  type WorktreeSearchFile,
  type WorktreeSearchOptions,
} from "../../lib/worktreeSearchApi";
import { getErrorMessage } from "../../lib/error";
import { ConfirmDialog } from "../ConfirmDialog";
import { WorkspaceSearchFields, SearchIcon } from "./WorkspaceSearchFields";
import { WorkspaceSearchResults } from "./WorkspaceSearchResults";

const initialOptions: WorktreeSearchOptions = {
  query: "",
  case_sensitive: false,
  whole_word: false,
  regex: false,
  include: "",
  exclude: "",
  use_ignore: true,
};
interface ReplacementTarget {
  projectId: string;
  path: string;
  scope: string;
  options: WorktreeSearchOptions;
  replacement: string;
  files: WorktreeSearchFile[];
  count: number;
}

export function WorkspaceSearch({
  active,
  onHide,
  focusRequest = 0,
}: {
  active: boolean;
  focusRequest?: number;
  onHide: () => void;
}) {
  const { t } = useTranslation();
  const { projects } = useApp();
  const route = useMatch("/project/:id/*");
  const { search: queryString } = useLocation();
  const navigate = useNavigate();
  const { setFiles } = useWorkspaceFiles();
  const activeWorkspace = useActiveWorkspace(projects);
  const project = route
    ? projects.find((item) => item.id === route.params.id)
    : activeWorkspace.project;
  const requested = route
    ? (new URLSearchParams(queryString).get("worktree") ?? project?.path)
    : activeWorkspace.path;
  const {
    worktrees,
    loading: treeLoading,
    error: treeError,
    refresh: refreshTrees,
  } = useProjectWorktrees(active ? project?.id : undefined);
  const worktree =
    worktrees.find((item) => item.path === requested) ??
    ((
      route
        ? !new URLSearchParams(queryString).has("worktree")
        : requested === project?.path
    )
      ? worktrees.find((item) => item.is_main)
      : undefined);
  const path = worktree?.available ? worktree.path : undefined;
  const scope = JSON.stringify([project?.id, path]);
  const [options, setOptions] = useState(initialOptions);
  const [replacement, setReplacement] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [collapse, setCollapse] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [target, setTarget] = useState<ReplacementTarget>();
  const [feedback, setFeedback] = useState<{
    scope: string;
    text?: string;
    errors: string[];
  }>();
  const search = useWorktreeSearch(project?.id, path, options, active);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (active)
      panel.current
        ?.querySelector<HTMLInputElement>("[data-workspace-search-input]")
        ?.focus();
  }, [active, focusRequest]);
  useEffect(() => {
    window.addEventListener("worktree-file-saved", search.refresh);
    return () =>
      window.removeEventListener("worktree-file-saved", search.refresh);
  }, [search.refresh]);
  const canReplace =
    !!search.data?.count &&
    !search.data.truncated &&
    !search.loading &&
    !replacing;
  const prepareReplacement = (files: WorktreeSearchFile[]) => {
    if (!canReplace || !project || !path) return;
    setFeedback(undefined);
    setTarget({
      projectId: project.id,
      path,
      scope,
      options,
      replacement,
      files,
      count: files.reduce((count, file) => count + file.matches.length, 0),
    });
  };
  const applyReplacement = async () => {
    if (!target || replacing || target.scope !== scope) return false;
    setReplacing(true);
    try {
      const result = await replaceWorktreeMatches(
        target.projectId,
        target.path,
        target.options,
        target.replacement,
        target.files,
      );
      setFeedback({
        scope: target.scope,
        text: t("workspaceSearch.replaced", {
          count: result.replaced,
          files: result.files,
        }),
        errors: result.errors,
      });
      window.dispatchEvent(new Event("worktree-file-saved"));
      return undefined;
    } catch (cause) {
      setFeedback({
        scope: target.scope,
        errors: [getErrorMessage(cause, t("common.error"))],
      });
      return false;
    } finally {
      setReplacing(false);
    }
  };
  const currentFeedback = feedback?.scope === scope ? feedback : undefined;
  return (
    <div
      ref={panel}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label={t("workspaceSearch.title")}
    >
      <div className="flex h-9 shrink-0 items-center gap-0.5 px-2">
        <h2
          className="mr-auto truncate pl-1 text-xs font-semibold text-secondary"
          title={
            project && worktree
              ? `${project.name} / ${worktreeLabel(worktree)}`
              : undefined
          }
        >
          {t("workspaceSearch.title")}
        </h2>
        <button
          type="button"
          disabled={replacing}
          aria-label={t("workspaceSearch.refresh")}
          title={t("workspaceSearch.refresh")}
          onClick={() => {
            void refreshTrees();
            search.refresh();
          }}
          className="app-button-ghost h-6 w-6 shrink-0 p-0"
        >
          <SearchIcon name="refresh" />
        </button>
        <button
          type="button"
          disabled={replacing || !options.query}
          aria-label={t("workspaceSearch.clear")}
          title={t("workspaceSearch.clear")}
          onClick={() => {
            setOptions({ ...options, query: "" });
            setFeedback(undefined);
            panel.current?.querySelector<HTMLInputElement>("input")?.focus();
          }}
          className="app-button-ghost h-6 w-6 shrink-0 p-0"
        >
          <SearchIcon name="clear-all" />
        </button>
        <button
          type="button"
          disabled={!search.data?.files.length}
          aria-label={t(
            collapse % 2
              ? "workspaceSearch.expandAll"
              : "workspaceSearch.collapseAll",
          )}
          title={t(
            collapse % 2
              ? "workspaceSearch.expandAll"
              : "workspaceSearch.collapseAll",
          )}
          onClick={() => setCollapse((value) => value + 1)}
          className="app-button-ghost h-6 w-6 shrink-0 p-0"
        >
          <SearchIcon name={collapse % 2 ? "expand-all" : "collapse-all"} />
        </button>
        <button
          type="button"
          aria-label={t("workspaceSearch.hide")}
          title={t("workspaceSearch.hide")}
          onClick={onHide}
          className="app-button-ghost h-6 w-6 shrink-0 p-0"
        >
          <SearchIcon name="layout-sidebar-left-off" />
        </button>
      </div>
      <WorkspaceSearchFields
        options={options}
        onChange={(next) => {
          setOptions(next);
          setFeedback(undefined);
        }}
        replacement={replacement}
        onReplacement={setReplacement}
        replaceOpen={replaceOpen}
        onReplaceOpen={setReplaceOpen}
        canReplace={canReplace}
        onReplace={() => prepareReplacement(search.data?.files ?? [])}
        onRefresh={search.refresh}
        disabled={replacing}
      />
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        aria-busy={search.loading || replacing}
      >
        {currentFeedback && (
          <div
            role={currentFeedback.errors.length ? "alert" : "status"}
            className="space-y-1 break-words border-b border-border-subtle px-3 py-2 text-xs text-secondary"
          >
            {currentFeedback.text}
            {currentFeedback.errors.map((error) => (
              <p key={error} className="text-danger">
                {error}
              </p>
            ))}
          </div>
        )}
        {treeError || search.error ? (
          <p role="alert" className="break-words px-3 py-2 text-xs text-danger">
            {treeError || search.error}
          </p>
        ) : !project ? (
          <p className="px-3 py-3 text-xs text-muted">
            {t("workspaceSearch.noWorkspace")}
          </p>
        ) : treeLoading || search.loading || replacing ? (
          <p
            role="status"
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted"
          >
            <Loader2
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
            />
            {t(
              replacing
                ? "workspaceSearch.replacing"
                : search.loading
                  ? "workspaceSearch.searching"
                  : "common.loading",
            )}
          </p>
        ) : !path ? (
          <p role="alert" className="px-3 py-3 text-xs text-danger">
            {t("worktree.unavailable")}
          </p>
        ) : !options.query ? null : (
          search.data && (
            <>
              <p role="status" className="px-3 py-2 text-xs text-muted">
                {t(
                  search.data.count
                    ? "workspaceSearch.summary"
                    : search.data.truncated
                      ? "workspaceSearch.incompleteNoResults"
                      : "workspaceSearch.noResults",
                  { count: search.data.count, files: search.data.files.length },
                )}
              </p>
              {search.data.truncated && (
                <p className="px-3 pb-2 text-xs text-danger">
                  {t("workspaceSearch.truncated")}
                </p>
              )}
              <WorkspaceSearchResults
                key={scope}
                files={search.data.files}
                collapseVersion={collapse}
                replaceOpen={replaceOpen}
                canReplace={canReplace}
                onReplace={(file) => prepareReplacement([file])}
                onSelect={(file, match) => {
                  if (!project || !path) return;
                  setFiles((previous) => ({
                    ...previous,
                    [scope]: {
                      path: file.path,
                      shown: true,
                      location: {
                        line: match.line,
                        column: match.column,
                        endColumn: match.end_column,
                      },
                    },
                  }));
                  navigate(worktreeUrl(project.id, path));
                }}
              />
              {search.data.skipped > 0 && (
                <p className="px-3 py-2 text-xs text-faint">
                  {t("workspaceSearch.skipped", { count: search.data.skipped })}
                </p>
              )}
            </>
          )
        )}
      </div>
      <ConfirmDialog
        open={!!target && target.scope === scope}
        title={t("workspaceSearch.replaceAll")}
        message={t("workspaceSearch.confirmReplace", {
          count: target?.count ?? 0,
          files: target?.files.length ?? 0,
        })}
        details={target?.files.map((file) => file.path)}
        confirmLabel={t("workspaceSearch.replaceAll")}
        onClose={() => setTarget(undefined)}
        onConfirm={applyReplacement}
      >
        {target && currentFeedback?.errors.length ? (
          <p role="alert" className="break-words text-xs text-danger">
            {currentFeedback.errors.join("\n")}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
