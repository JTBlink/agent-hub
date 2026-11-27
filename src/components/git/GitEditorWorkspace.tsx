import { isPreviewableImage } from "../../features/image-preview";
import { useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GitEditorTabsContext } from "../../hooks/gitEditorVisibility";
import type { GitEditors } from "../../hooks/useGitEditors";
import {
  getProjectGitCommitDiff,
  type GitCommitFileView,
  type GitFile,
} from "../../lib/gitApi";
import { getErrorMessage } from "../../lib/error";
import { GitGraph } from "./GitGraph";
import { GitFileEditor } from "./GitFileEditor";
import type { CommitFileSelection, CommitTarget } from "./GitCommitDetails";

function CommitEditor({
  target,
  file,
  revision,
  onClose,
}: {
  target: CommitTarget;
  file: CommitFileSelection;
  revision: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{
    key: string;
    file?: GitCommitFileView;
    error?: string;
  }>();
  const key = JSON.stringify([
    target,
    file,
    file.view === "working" ? revision : 0,
  ]);
  useEffect(() => {
    if (file.view === "file" || isPreviewableImage(file.path)) return;
    let cancelled = false;
    void getProjectGitCommitDiff(
      target.projectId,
      target.worktreePath,
      file.sha,
      file.path,
      file.view,
    ).then(
      (file) => {
        if (!cancelled) setResult({ key, file });
      },
      (cause) => {
        if (!cancelled)
          setResult({ key, error: getErrorMessage(cause, t("common.error")) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    target.projectId,
    target.worktreePath,
    file.sha,
    file.path,
    file.view,
    key,
    t,
  ]);
  const current = result?.key === key ? result : undefined;
  return (
    <GitFileEditor
      activeId={target.projectId}
      root={target.worktreePath}
      selection={{ path: file.path, staged: false }}
      commitSha={file.view === "file" ? undefined : file.sha}
      revisionView={file.view === "revision"}
      compareWorking={file.view === "working"}
      fileView={file.view === "file"}
      files={[]}
      diff={current?.file?.content}
      unchangedText={current?.file?.unchanged_text}
      diffError={current?.error}
      onClose={onClose}
    />
  );
}

/** Keep Graph and opened revisions mounted independently in the shared tab strip. */
export function GitEditorWorkspace({
  target,
  editors,
  revision,
  files,
  busy,
  fetching,
  onFetch,
  onRefresh,
  children,
}: {
  target: CommitTarget;
  editors: GitEditors;
  revision: number;
  files: GitFile[];
  busy: boolean;
  fetching: boolean;
  onFetch: () => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const shared = useContext(GitEditorTabsContext);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const pane = (id: string, content: ReactNode) => (
    <GitEditorTabsContext.Provider
      key={id}
      value={{
        container: shared?.container ?? container,
        active: (shared?.active ?? true) && editors.active === id,
        onSelect: () => {
          editors.select(id);
        },
        onTerminal: shared?.onTerminal,
      }}
    >
      <div
        hidden={editors.active !== id}
        className={
          editors.active === id ? "flex min-h-0 flex-1 flex-col" : "hidden"
        }
      >
        {content}
      </div>
    </GitEditorTabsContext.Provider>
  );
  const graphPane = (
    id: string,
    path?: string,
    focusCommit?: { sha: string },
  ) =>
    pane(
      id,
      <GitGraph
        key={path}
        target={target}
        path={path}
        focusCommit={focusCommit}
        revision={revision}
        changedFiles={path ? 0 : files.length}
        busy={busy}
        fetching={fetching}
        onFetch={onFetch}
        onRefresh={onRefresh}
        onClose={() => editors.close(id)}
        onSelect={editors.openFile}
      />,
    );
  return (
    <>
      {!shared && (
        <div
          ref={setContainer}
          role="tablist"
          className="flex h-9 shrink-0 overflow-x-auto border-b border-border-subtle bg-bg-secondary"
        />
      )}
      {editors.graph && graphPane("graph", undefined, editors.graphCommit)}
      {editors.historyPath && graphPane("fileHistory", editors.historyPath)}
      {editors.files.map((file) =>
        pane(
          editors.fileId(file),
          <CommitEditor
            target={target}
            file={file}
            revision={revision}
            onClose={() => editors.close(editors.fileId(file))}
          />,
        ),
      )}
      {pane("working", children)}
    </>
  );
}
