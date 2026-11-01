import { useContext } from "react";
import { createPortal } from "react-dom";
import { GitEditorTabsContext } from "../../hooks/gitEditorVisibility";
import { TabCloseButton } from "../TabCloseButton";
import { cn } from "../../utils";
import { FileCode2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitFile } from "../../lib/gitApi";
import type { GitSelection } from "./GitChanges";
import { GitDiffViewer } from "./GitDiffViewer";
import { WorktreeFilePreview } from "../worktree/WorktreeFilePreview";

export function GitFileEditor({
  activeId,
  root,
  selection,
  commitSha,
  fileView,
  diff,
  diffError,
  files,
  onFileViewChange,
  onClose,
}: {
  activeId: string;
  root?: string;
  selection: GitSelection;
  commitSha?: string;
  fileView: boolean;
  diff?: string;
  diffError?: string;
  files: GitFile[];
  onFileViewChange: (value: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sharedTabs = useContext(GitEditorTabsContext);
  const active = sharedTabs?.active ?? true;
  const tab = (
    <div
      className={cn(
        "flex h-full shrink-0 items-center border-b-2",
        active ? "border-accent text-primary" : "border-transparent text-muted",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={selection.path}
        onClick={() => sharedTabs?.onSelect()}
        className="flex h-full max-w-64 items-center gap-1.5 px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <FileCode2 size={13} className="shrink-0" />
        <span className="truncate">{selection.path.split("/").pop()}</span>
        <span className="shrink-0 text-muted">
          {commitSha
            ? commitSha.slice(0, 7)
            : t(selection.staged ? "git.staged" : "git.unstaged")}
        </span>
      </button>
      <TabCloseButton
        aria-label={t("common.close")}
        title={t("common.close")}
        onClick={onClose}
      />
    </div>
  );
  return (
    <>
      {sharedTabs ? (
        sharedTabs.container && createPortal(tab, sharedTabs.container)
      ) : (
        <div
          role="tablist"
          className="flex h-9 shrink-0 items-center border-b border-border-subtle bg-bg-secondary"
        >
          {tab}
        </div>
      )}
      {fileView && (
        <div className="flex shrink-0 items-center border-b border-border-subtle px-2 py-1">
          <button
            type="button"
            className="app-button-ghost px-2 py-1 text-xs"
            onClick={() => onFileViewChange(false)}
          >
            {t("git.diff")}
          </button>
        </div>
      )}
      {fileView && root ? (
        <WorktreeFilePreview
          key={`${activeId}:${root}:${selection.path}`}
          projectId={activeId}
          worktreePath={root}
          path={selection.path}
        />
      ) : diff !== undefined ? (
        <GitDiffViewer
          patch={diff}
          path={selection.path}
          staged={selection.staged}
          historical={!!commitSha}
          onOpenFile={
            !commitSha &&
            files.find((file) => file.path === selection.path)?.status !==
              "deleted"
              ? () => onFileViewChange(true)
              : undefined
          }
        />
      ) : (
        <p role="status" className="p-6 text-xs text-muted">
          {diffError || t("common.loading")}
        </p>
      )}
    </>
  );
}
