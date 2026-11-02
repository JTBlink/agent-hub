import { FileCode2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitFile } from "../../lib/gitApi";
import type { GitSelection } from "./GitChanges";
import { GitDiffViewer } from "./GitDiffViewer";
import { GitEditorTab } from "./GitEditorTab";
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
      <GitEditorTab
        label={selection.path.split("/").pop() ?? selection.path}
        title={selection.path}
        detail={
          commitSha
            ? commitSha.slice(0, 7)
            : t(selection.staged ? "git.staged" : "git.unstaged")
        }
        icon={<FileCode2 size={13} className="shrink-0" />}
        onClose={onClose}
      />
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
