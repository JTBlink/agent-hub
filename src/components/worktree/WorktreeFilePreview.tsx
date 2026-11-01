import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { openFileInVscode } from "../../lib/openInVscode";
import { FileContent } from "../file-reader/FileContent";
import { useWorktreeDocument } from "../../hooks/useWorktreeDocument";

export function WorktreeFilePreview({
  projectId,
  worktreePath,
  path,
}: {
  projectId: string;
  worktreePath: string;
  path: string;
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
            disabled={document.dirty}
            onClick={() => void document.reload()}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {document.draft !== undefined && (
        <FileContent
          file={{ path, content: document.draft }}
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
              <span role="status" className="mr-auto text-muted">
                {document.dirty
                  ? t("worktree.unsaved")
                  : t(
                      document.editing
                        ? "fileReader.editable"
                        : "fileReader.readOnly",
                    )}
              </span>
              {document.editing ? (
                <>
                  <button
                    type="button"
                    className="app-button-ghost px-2 py-1"
                    disabled={document.saving}
                    onClick={document.cancel}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className="app-button-primary px-2 py-1 text-xs"
                    disabled={!document.dirty || document.saving}
                    onClick={() => void document.save()}
                  >
                    {t("common.save")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="app-button-ghost px-2 py-1"
                  disabled={document.draft === undefined}
                  onClick={document.edit}
                >
                  {t("common.edit")}
                </button>
              )}
            </div>
          }
          onContentChange={
            document.editing && !document.saving
              ? (_, content) => document.change(content)
              : undefined
          }
          onOpenInVscode={(file) => openFileInVscode(worktreePath, file)}
        />
      )}
    </div>
  );
}
