// Independent in-memory adapter for the existing Git backup flow. No Git or IPC calls.
import { createContext, useCallback, useContext, useState } from "react";
import {
  launchDocument,
  serializeLaunchDocument,
  type LaunchDocument,
} from "./agentLaunchDocument";
import { initialAgents } from "./agentData";
export type SyncScenario = "success" | "failure" | "conflict" | "disconnected";
type Phase = "idle" | "syncing" | "error" | "conflict";
const initial = launchDocument(initialAgents, "codex");
export function useAgentSyncController() {
  const [document, setDocument] = useState(initial);
  const [synced, setSynced] = useState(initial);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scenario, setSyncScenario] = useState<SyncScenario>("success");
  const [remote, setRemote] = useState<LaunchDocument | null>(null);
  const [adopted, setAdopted] = useState<LaunchDocument | null>(null);
  const [completed, setCompleted] = useState(false);
  const update = useCallback((next: LaunchDocument) => {
    setDocument((previous) =>
      serializeLaunchDocument(previous) === serializeLaunchDocument(next)
        ? previous
        : next,
    );
  }, []);
  const dirty =
    serializeLaunchDocument(document) !== serializeLaunchDocument(synced);
  const sync = async (mode: SyncScenario = scenario) => {
    if (phase === "syncing" || mode === "disconnected") return;
    const captured = document;
    setPhase("syncing");
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    if (mode === "failure") {
      setPhase("error");
      return;
    }
    if (mode === "conflict") {
      setRemote({
        ...captured,
        instructions: {
          ...captured.instructions,
          codex: "codex --no-alt-screen",
        },
      });
      setPhase("conflict");
      return;
    }
    setSynced(captured);
    setPhase("idle");
    setCompleted(true);
    setRemote(null);
  };
  const chooseScenario = (mode: SyncScenario) => {
    setSyncScenario(mode);
    if (phase !== "syncing") setPhase("idle");
  };
  const acceptRemote = () => {
    if (!remote) return;
    setDocument(remote);
    setSynced(remote);
    setAdopted({ ...remote });
    setRemote(null);
    setPhase("idle");
    setSyncScenario("success");
    setCompleted(true);
  };
  const keepLocal = () => {
    setSyncScenario("success");
    return sync("success");
  };
  return {
    document,
    dirty,
    phase,
    scenario,
    remote,
    adopted,
    completed,
    update,
    sync,
    chooseScenario,
    acceptRemote,
    keepLocal,
  };
}
type Controller = ReturnType<typeof useAgentSyncController>;
export const AgentSyncPrototypeContext = createContext<Controller | null>(null);
export function useAgentSyncPrototype() {
  const controller = useContext(AgentSyncPrototypeContext);
  if (!controller)
    throw new Error("Agent sync prototype requires its provider");
  return controller;
}
