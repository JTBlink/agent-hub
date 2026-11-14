import { useEffect, useLayoutEffect, useRef } from "react";
import * as api from "../api";

/** Follow project navigation only after opt-in; coalesce rapid changes and serialize focus. */
export function useHerdrProjectWorkspace({
  enabled,
  session,
  projectId,
  path,
  onReady,
  onError,
  refresh,
}: {
  enabled: boolean;
  session: string;
  projectId?: string;
  path?: string;
  onReady: (value: api.HerdrOpenedWorkspace) => void | Promise<void>;
  onError: (error: unknown) => void;
  refresh: () => void;
}) {
  const callbacks = useRef({ onReady, onError, refresh });
  useLayoutEffect(() => {
    callbacks.current = { onReady, onError, refresh };
  });
  const lastRequested = useRef("");
  const tail = useRef(Promise.resolve());
  useEffect(() => {
    if (!enabled || !session || !projectId) return;
    const key = JSON.stringify([session, projectId, path]);
    if (lastRequested.current === key) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      tail.current = tail.current.then(async () => {
        if (cancelled) return;
        try {
          await api.prepareHerdrSession();
          if (cancelled) return;
          lastRequested.current = key;
          const value = await api.ensureHerdrWorkspace(
            session,
            projectId,
            path,
          );
          if (!cancelled) {
            await callbacks.current.onReady(value);
            callbacks.current.refresh();
          }
        } catch (error) {
          if (!cancelled) callbacks.current.onError(error);
        }
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, session, projectId, path]);
}
