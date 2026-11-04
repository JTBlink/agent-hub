import type { ReactNode } from "react";
import {
  AgentSyncPrototypeContext,
  useAgentSyncController,
} from "./useAgentSyncPrototype";
export function AgentSyncPrototypeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const controller = useAgentSyncController();
  return (
    <AgentSyncPrototypeContext.Provider value={controller}>
      {children}
    </AgentSyncPrototypeContext.Provider>
  );
}
