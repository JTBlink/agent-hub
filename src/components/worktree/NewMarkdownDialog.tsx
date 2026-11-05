import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBrowserDialog } from "../GitBrowserDialog";
import {
  modifyWorktreeEntry,
  WORKTREE_FILES_CHANGED,
} from "../../lib/worktreeApi";
import { getErrorMessage } from "../../lib/error";

/** Creates a real checkout file; the existing editor owns save and close guards. */
export function NewMarkdownDialog({
  projectId,
  worktreePath,
  onClose,
  onCreated,
}: {
  projectId: string;
  worktreePath: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("Untitled.md");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current || !name.trim()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const filename = /\.md$/i.test(name.trim())
        ? name.trim()
        : `${name.trim()}.md`;
      const path = await modifyWorktreeEntry(projectId, worktreePath, "", {
        kind: "new_file",
        name: filename,
      });
      window.dispatchEvent(
        new CustomEvent(WORKTREE_FILES_CHANGED, {
          detail: { projectId, worktreePath },
        }),
      );
      window.dispatchEvent(new Event("project-git-changed"));
      onCreated(path);
      onClose();
    } catch (cause) {
      setError(getErrorMessage(cause, t("common.error")));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <GitBrowserDialog
      title={t("terminal.newMarkdown")}
      busy={busy}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <label className="block text-sm text-secondary">
          {t("terminal.markdownName")}
          <input
            data-initial-focus
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-primary focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="app-button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="app-button-primary"
            disabled={busy || !name.trim()}
          >
            {t("common.create")}
          </button>
        </div>
      </form>
    </GitBrowserDialog>
  );
}
