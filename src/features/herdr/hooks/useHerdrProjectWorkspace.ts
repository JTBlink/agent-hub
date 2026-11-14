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
  const lastRequest = useRef<{
    key: string;
    delivered: boolean;
    outcome?: { value: api.HerdrOpenedWorkspace } | { error: unknown };
  } | null>(null);
  const tail = useRef(Promise.resolve());
  useEffect(() => {
    if (!enabled || !session || !projectId) return;
    const key = JSON.stringify([session, projectId, path]);
    if (lastRequest.current?.key === key && lastRequest.current.delivered)
      return;
    let cancelled = false;
    const timer = setTimeout(() => {
      tail.current = tail.current.then(async () => {
        if (cancelled) return;
        try {
          let request = lastRequest.current;
          if (!request || request.key !== key) {
            await api.prepareHerdrSession();
            if (cancelled) return;
            request = { key, delivered: false };
            lastRequest.current = request;
            try {
              request.outcome = {
                value: await api.ensureHerdrWorkspace(session, projectId, path),
              };
            } catch (error) {
              // A cancelled UI request must not cause an uncertain native write to repeat.
              request.outcome = { error };
            }
          }
          if (cancelled || request.delivered || !request.outcome) return;
          if ("error" in request.outcome) throw request.outcome.error;
          await callbacks.current.onReady(request.outcome.value);
          request.delivered = true;
          callbacks.current.refresh();
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
