import { useEffect } from "react";
import {
  ensureHerdrWorkspace,
  type HerdrOpenedWorkspace,
} from "../lib/herdrControlApi";

/** Only the app-owned session follows project navigation; other sessions remain untouched. */
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
  onReady: (value: HerdrOpenedWorkspace) => void;
  onError: (error: unknown) => void;
  refresh: () => void;
}) {
  useEffect(() => {
    if (!enabled || !session || !projectId) return;
    let cancelled = false;
    void ensureHerdrWorkspace(session, projectId, path).then(
      (value) => {
        if (!cancelled) {
          onReady(value);
          refresh();
        }
      },
      (error) => {
        if (!cancelled) onError(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, session, projectId, path, onReady, onError, refresh]);
}
