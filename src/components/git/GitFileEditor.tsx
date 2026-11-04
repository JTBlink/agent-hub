import { CodeEditor } from "../file-reader/CodeEditor";
import { FileTypeIcon } from "../FileTypeIcon";
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
  revisionView,
  compareWorking,
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
  revisionView?: boolean;
  compareWorking?: boolean;
  fileView: boolean;
  diff?: string;
  diffError?: string;
  files: GitFile[];
  onFileViewChange?: (value: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const name = selection.path.split("/").pop() ?? selection.path;
  const sha = commitSha?.slice(0, 8);
  const versions = fileView
    ? undefined
    : sha
      ? revisionView
        ? sha
        : `${sha}${compareWorking ? "" : "^"} ↔ ${compareWorking ? t("git.workingVersion") : sha}`
      : `${selection.staged ? "HEAD" : t("git.indexVersion")} ↔ ${t(selection.staged ? "git.indexVersion" : "git.workingVersion")}`;
  const label = versions ? `${name} (${versions})` : name;
  return (
    <>
      <GitEditorTab
        label={label}
        title={versions ? `${selection.path} (${versions})` : selection.path}
        icon={<FileTypeIcon path={selection.path} size={13} />}
        onClose={onClose}
      />
      {fileView && onFileViewChange && (
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
      ) : diff !== undefined && revisionView ? (
        <CodeEditor
          file={{ path: selection.path, content: diff }}
          wrap={false}
        />
      ) : diff !== undefined ? (
        <GitDiffViewer
          patch={diff}
          path={selection.path}
          staged={selection.staged}
          historical={!!commitSha}
          compareWorking={compareWorking}
          onOpenFile={
            !commitSha &&
            files.find((file) => file.path === selection.path)?.status !==
              "deleted"
              ? () => onFileViewChange?.(true)
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
