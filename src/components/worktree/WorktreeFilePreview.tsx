import type { ReaderLocation } from "../file-reader/types";
import { useTranslation } from "react-i18next";
import { RefreshCw, Save } from "lucide-react";
import { FileContent } from "../file-reader/FileContent";
import { useWorktreeDocument } from "../../hooks/useWorktreeDocument";

export function WorktreeFilePreview({
  projectId,
  worktreePath,
  path,
  location,
  toolbarContainer,
}: {
  projectId: string;
  worktreePath: string;
  path: string;
  location?: ReaderLocation;
  toolbarContainer?: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const document = useWorktreeDocument(projectId, worktreePath, path);
  if (document.loading && document.draft === undefined)
    return (
      <p role="status" className="m-4 text-sm text-muted">
        {t("common.loading")}
      </p>
    );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (document.dirty) void document.save();
        }
      }}
    >
      {document.error && (
        <div role="alert" className="px-3 py-2 text-xs text-danger">
          {document.error}
          <button
            type="button"
            className="app-button-ghost ml-2"
            disabled={document.dirty || document.saving || document.loading}
            onClick={() => void document.reload()}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {document.draft !== undefined && (
        <FileContent
          file={{ path, content: document.draft }}
          location={location}
          toolbarContainer={toolbarContainer}
          showOpenInVscode={false}
          defaultSource
          maxLength={1024 * 1024}
          actions={
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                className="app-button-ghost p-1"
                aria-label={t("settings.refresh")}
                title={t("settings.refresh")}
                disabled={document.dirty || document.saving || document.loading}
                onClick={() => void document.reload()}
              >
                <RefreshCw size={13} />
              </button>
              {(document.dirty || toolbarContainer === undefined) && (
                <span role="status" className="text-muted">
                  {document.dirty
                    ? t("worktree.unsaved")
                    : t("fileReader.editable")}
                </span>
              )}
              <button
                type="button"
                className="app-button-ghost px-2 py-1 text-xs"
                aria-label={t("common.save")}
                title={t("common.save")}
                disabled={!document.dirty || document.saving}
                onClick={() => void document.save()}
              >
                {toolbarContainer !== undefined ? (
                  <Save size={15} />
                ) : (
                  t("common.save")
                )}
              </button>
            </div>
          }
          onContentChange={
            !document.saving && !document.loading
              ? (_, content) => document.change(content)
              : undefined
          }
        />
      )}
    </div>
  );
}
