import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentLaunchDocument,
  AgentLaunchSnapshot,
} from "../lib/agentLaunchConfig";
import { getErrorMessage } from "../lib/error";
import {
  publishAgentLaunchUpdate,
  subscribeAgentLaunchUpdates,
} from "../lib/agentLaunchUpdates";
import * as api from "../lib/tauri";

export function useAgentLaunchSettings() {
  const [snapshot, setSnapshot] = useState<AgentLaunchSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const snapshotRef = useRef<AgentLaunchSnapshot | null>(null);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(false));
  const request = useRef(0);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    if (saving.current) return;
    const generation = ++request.current;
    try {
      const next = await api.getAgentLaunchSettings();
      if (alive.current && generation === request.current) {
        publishAgentLaunchUpdate(next);
      }
    } catch (e) {
      if (alive.current && generation === request.current)
        setError(getErrorMessage(e, String(e)));
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = subscribeAgentLaunchUpdates((next) => {
      ++request.current;
      snapshotRef.current = next;
      setSnapshot(next);
      setError("");
    });
    void reload();
    return () => {
      alive.current = false;
      unsubscribe();
    };
  }, [reload]);
  const save = (
    change: (current: AgentLaunchDocument) => AgentLaunchDocument,
  ) => {
    const operation = saveQueue.current.catch(() => false).then(async () => {
      const current = snapshotRef.current;
      if (!current) return false;
      saving.current = true;
      ++request.current;
      if (alive.current) setBusy(true);
      try {
        const next = await api.saveAgentLaunchSettings(
          change(current.document),
          current.revision,
        );
        snapshotRef.current = next;
        publishAgentLaunchUpdate(next);
        return true;
      } catch (e) {
        if (alive.current) setError(getErrorMessage(e, String(e)));
        return false;
      } finally {
        saving.current = false;
        if (alive.current) setBusy(false);
      }
    });
    saveQueue.current = operation.catch(() => false);
    return operation;
  };
  return { snapshot, busy, error, reload, save };
}
