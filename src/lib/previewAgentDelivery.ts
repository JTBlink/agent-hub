import type {
  AgentDeliveryAdapter,
  AgentDeliveryPage,
  AgentDeliveryPlan,
} from "./agentDelivery";

import { getToolStatus } from "./tauri";
import { installedTerminalAgents } from "./terminalAgents";
import { herdrEnabled, HerdrIcon } from "@app/herdr";

export interface PreviewAgentRequest {
  agentId?: string;
  preview?: boolean;
  workspacePath: string;
  page: AgentDeliveryPage;
  prompt: string;
  verify: () => Promise<void>;
}
type Listener = (
  request: PreviewAgentRequest,
) => Promise<void | AgentDeliveryPlan> | null;
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
  launchHost: herdrEnabled ? { name: "Herdr", Icon: HerdrIcon } : undefined,
  preview: async (workspacePath, page, prompt, agentId) => {
    for (const listener of listeners) {
      const pending = listener({
        workspacePath,
        page,
        prompt,
        agentId,
        preview: true,
        verify: async () => {},
      });
      if (pending) {
        const plan = await pending;
        if (plan) return plan;
        break;
      }
    }
    throw Error("PREVIEW_AGENT_WORKSPACE_UNAVAILABLE");
  },
  listAgents: async () => installedTerminalAgents(await getToolStatus()),
  resolveCurrent: async (workspacePath, page, agentId) => {
    if (!workspacePath || !page) return null;
    return {
      send: async (prompt, verify = async () => {}) => {
        for (const listener of listeners) {
          const pending = listener({
            workspacePath,
            page,
            prompt,
            verify,
            ...(agentId ? { agentId } : {}),
          });
          if (pending) {
            await pending;
            return;
          }
        }
        throw Error("PREVIEW_AGENT_WORKSPACE_UNAVAILABLE");
      },
    };
  },
};
