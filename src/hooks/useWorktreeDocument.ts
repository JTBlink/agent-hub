import { useCallback, useEffect, useSyncExternalStore } from "react";
import { readWorktreeFile, writeWorktreeFile } from "../lib/worktreeApi";
import { getErrorMessage } from "../lib/error";
import i18n from "../i18n";

interface Document {
  original?: string;
  draft?: string;
  editing: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
}
const empty: Document = {
  editing: false,
  loading: true,
  saving: false,
  error: "",
};
const documents = new Map<string, Document>();
const listeners = new Set<() => void>();
const pending = new Set<string>();
let warningInstalled = false;
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = "";
};
function publish(key: string, patch: Partial<Document>) {
  documents.set(key, { ...(documents.get(key) ?? empty), ...patch });
  const dirty = [...documents.values()].some(
    (doc) => doc.draft !== doc.original,
  );
  if (dirty !== warningInstalled) {
    if (dirty) window.addEventListener("beforeunload", warnBeforeUnload);
    else window.removeEventListener("beforeunload", warnBeforeUnload);
    warningInstalled = dirty;
  }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Unsaved drafts survive file, worktree and page switches for this session. */
export function useWorktreeDocument(
  projectId: string,
  worktreePath: string,
  path: string,
) {
  const key = JSON.stringify([projectId, worktreePath, path]);
  const document = useSyncExternalStore(
    subscribe,
    () => documents.get(key) ?? empty,
  );
  const reload = useCallback(async () => {
    if (pending.has(key)) return;
    pending.add(key);
    publish(key, { loading: true, error: "" });
    try {
      const content = await readWorktreeFile(projectId, worktreePath, path);
      publish(key, { original: content, draft: content, editing: false });
    } catch (cause) {
      publish(key, { error: getErrorMessage(cause, i18n.t("common.error")) });
    } finally {
      pending.delete(key);
      publish(key, { loading: false });
    }
  }, [key, projectId, worktreePath, path]);
  useEffect(() => {
    const previous = documents.get(key);
    if (
      !previous ||
      (!previous.editing &&
        !previous.saving &&
        previous.original === previous.draft)
    )
      void reload();
  }, [key, reload]);
  useEffect(() => {
    const reloadCleanFile = () => {
      const current = documents.get(key);
      if (
        current &&
        !current.editing &&
        !current.saving &&
        current.draft === current.original
      )
        void reload();
    };
    window.addEventListener("worktree-file-saved", reloadCleanFile);
    return () =>
      window.removeEventListener("worktree-file-saved", reloadCleanFile);
  }, [key, reload]);
  const save = async () => {
    const current = documents.get(key);
    if (
      !current ||
      current.saving ||
      current.original === undefined ||
      current.draft === undefined
    )
      return;
    publish(key, { saving: true, error: "" });
    try {
      await writeWorktreeFile(
        projectId,
        worktreePath,
        path,
        current.original,
        current.draft,
      );
      publish(key, { original: current.draft, editing: false });
      window.dispatchEvent(new Event("worktree-file-saved"));
    } catch (cause) {
      publish(key, { error: getErrorMessage(cause, i18n.t("common.error")) });
    } finally {
      publish(key, { saving: false });
    }
  };
  return {
    ...document,
    dirty: document.draft !== document.original,
    reload,
    save,
    edit: () => publish(key, { editing: true }),
    change: (draft: string) => {
      if (!documents.get(key)?.saving) publish(key, { draft });
    },
    cancel: () =>
      publish(key, { draft: document.original, editing: false, error: "" }),
  };
}
