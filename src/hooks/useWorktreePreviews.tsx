import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { previewApi } from "../features/preview/api";
import {
  WorktreePreviewsContext,
  type WorktreePreview,
} from "./worktreePreviewsContext";

export function WorktreePreviewsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [tabs, setTabs] = useState<WorktreePreview[]>([]);
  const owned = useRef(tabs);
  const [selected, select] = useState<string | null>(null);
  const guards = useRef(new Map<string, () => boolean>());
  const registerClose = useCallback((id: string, guard: () => boolean) => {
    guards.current.set(id, guard);
    return () => {
      if (guards.current.get(id) === guard) guards.current.delete(id);
    };
  }, []);
  const pending = useRef(new Map<string, Promise<void>>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const tab of owned.current)
        void previewApi.closeDocument(tab.document.id).catch(() => {});
      owned.current = [];
    };
  }, []);
  const open = async (
    projectId: string,
    worktreePath: string,
    path: string,
    url?: string,
  ) => {
    const scope = JSON.stringify([projectId, worktreePath]);
    const existing = owned.current.find(
      (tab) =>
        tab.scope === scope && tab.path === path && tab.sourceUrl === url,
    );
    if (existing) {
      select(existing.document.id);
      return;
    }
    const key = JSON.stringify([scope, path, url]);
    if (pending.current.has(key)) return pending.current.get(key)!;
    const request = (async () => {
      const document = await previewApi.openProject(
        projectId,
        worktreePath,
        path,
      );
      if (!mounted.current) {
        await previewApi.closeDocument(document.id);
        return;
      }
      if (url) document.url = url;
      owned.current = [
        ...owned.current,
        { scope, path, document, sourceUrl: url },
      ];
      setTabs(owned.current);
      select(document.id);
    })();
    pending.current.set(key, request);
    try {
      await request;
    } finally {
      pending.current.delete(key);
    }
  };
  const close = (id: string) => {
    if (guards.current.get(id)?.() === false) {
      select(id);
      return;
    }
    guards.current.delete(id);
    owned.current = owned.current.filter((tab) => tab.document.id !== id);
    setTabs(owned.current);
    select((current) => (current === id ? null : current));
    void previewApi.closeDocument(id).catch(() => {});
  };
  return (
    <WorktreePreviewsContext.Provider
      value={{ tabs, selected, select, open, close, registerClose }}
    >
      {children}
    </WorktreePreviewsContext.Provider>
  );
}
