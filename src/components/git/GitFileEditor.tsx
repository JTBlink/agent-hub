import { FileCode2, X } from "lucide-react";
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
  return (
    <>
      <div className="flex shrink-0 items-center border-b border-border-subtle bg-bg-secondary">
        <div className="flex min-w-0 items-center gap-2 border-r border-border-subtle border-t-2 border-t-accent bg-background px-3 py-2 text-xs">
          <FileCode2 size={14} className="shrink-0 text-accent-light" />
          <span className="truncate" title={selection.path}>
            {selection.path.split("/").pop()}
          </span>
          <span className="shrink-0 text-muted">
            {commitSha
              ? commitSha.slice(0, 7)
              : t(selection.staged ? "git.staged" : "git.unstaged")}
          </span>
          <button
            type="button"
            aria-label={t("common.close")}
            title={t("common.close")}
            className="app-button-ghost h-5 w-5 shrink-0 p-0"
            onClick={onClose}
          >
            <X size={12} />
          </button>
        </div>
      </div>
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
