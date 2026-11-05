import type { AgentDeliveryAdapter, AgentDeliveryPage } from "./agentDelivery";

export interface PreviewAgentRequest {
  workspacePath: string;
  page: AgentDeliveryPage;
  prompt: string;
  verify: () => Promise<void>;
}
type Listener = (request: PreviewAgentRequest) => Promise<void> | null;
const listeners = new Set<Listener>();
export function listenPreviewAgent(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** The persistent terminal workspace owns selection, launch and page bindings. */
export const embeddedAgentDeliveryAdapter: AgentDeliveryAdapter = {
  id: "embedded",
  label: "Agent",
  resolveCurrent: async (workspacePath, page) => {
    if (!workspacePath || !page) return null;
    return {
      send: async (prompt, verify = async () => {}) => {
        for (const listener of listeners) {
          const pending = listener({ workspacePath, page, prompt, verify });
          if (pending) return pending;
        }
        throw Error("PREVIEW_AGENT_WORKSPACE_UNAVAILABLE");
      },
    };
  },
};
