import { useCallback, useEffect, useSyncExternalStore } from "react";
import { readWorktreeFile, writeWorktreeFile } from "../lib/worktreeApi";
import { getErrorMessage } from "../lib/error";
import i18n from "../i18n";

interface Document {
  original?: string;
  draft?: string;
  loading: boolean;
  saving: boolean;
  error: string;
}
const empty: Document = {
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
      publish(key, { original: content, draft: content });
    } catch (cause) {
      publish(key, { error: getErrorMessage(cause, i18n.t("common.error")) });
    } finally {
      pending.delete(key);
      publish(key, { loading: false });
    }
  }, [key, projectId, worktreePath, path]);
  useEffect(() => {
    const previous = documents.get(key);
    if (!previous || (!previous.saving && previous.original === previous.draft))
      void reload();
  }, [key, reload]);
  useEffect(() => {
    const reloadCleanFile = () => {
      const current = documents.get(key);
      if (current && !current.saving && current.draft === current.original)
        void reload();
    };
    window.addEventListener("worktree-file-saved", reloadCleanFile);
    return () =>
      window.removeEventListener("worktree-file-saved", reloadCleanFile);
  }, [key, reload]);
  return {
    ...document,
    dirty: document.draft !== document.original,
    reload,
    save: () => saveWorktreeDocument(key),
    change: (draft: string) => {
      if (!documents.get(key)?.saving) publish(key, { draft });
    },
  };
}

export async function saveWorktreeDocument(key: string): Promise<boolean> {
  const [projectId, worktreePath, path]: string[] = JSON.parse(key);
  const current = documents.get(key);
  if (
    !current ||
    current.saving ||
    current.original === undefined ||
    current.draft === undefined
  )
    return false;
  publish(key, { saving: true, error: "" });
  try {
    await writeWorktreeFile(
      projectId,
      worktreePath,
      path,
      current.original,
      current.draft,
    );
    publish(key, { original: current.draft });
    window.dispatchEvent(new Event("worktree-file-saved"));
    return true;
  } catch (cause) {
    publish(key, { error: getErrorMessage(cause, i18n.t("common.error")) });
    return false;
  } finally {
    publish(key, { saving: false });
  }
}

export function dirtyWorktreeDocuments() {
  return [...documents.entries()]
    .filter(([, doc]) => doc.draft !== doc.original)
    .map(([key]) => {
      const [, , path]: string[] = JSON.parse(key);
      return { key, path };
    });
}

export function discardWorktreeDocument(key: string) {
  const document = documents.get(key);
  if (document && !document.saving)
    publish(key, { draft: document.original, error: "" });
}

/** File tree mutations must not orphan drafts or race an in-progress save. */
export function hasPendingWorktreeDocument(
  projectId: string,
  worktreePath: string,
  path: string,
) {
  return [...documents.entries()].some(([key, document]) => {
    const [project, worktree, file]: string[] = JSON.parse(key);
    return (
      project === projectId &&
      worktree === worktreePath &&
      (file === path || file.startsWith(`${path}/`)) &&
      (document.saving || document.draft !== document.original)
    );
  });
}
