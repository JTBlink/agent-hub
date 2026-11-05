/** A destination owns its transport and final identity validation. */
export interface AgentDeliveryDestination {
  send: (prompt: string, verify?: () => Promise<void>) => Promise<unknown>;
}
export interface AgentDeliveryPage {
  id: string;
  title: string;
  projectId?: string;
  /** Authorized local source path, independent of the browser preview URL. */
  path?: string;
}
export interface AgentDeliveryPlan {
  backend: "herdr" | "native";
  agent: string;
  command: string;
  /** New Herdr commands allocate a separate workspace when copied and run. */
  createsWorkspace: boolean;
}
export interface AgentDeliveryChoice {
  id: string;
  label: string;
  toolKey: string;
}
/** The workbench composes providers; preview never imports a provider's internals. */
export interface AgentDeliveryAdapter {
  id: string;
  label: string;
  preview?: (
    workspacePath: string,
    page: AgentDeliveryPage,
    text: string,
    agentId?: string,
  ) => Promise<AgentDeliveryPlan>;
  listAgents?: () => Promise<AgentDeliveryChoice[]>;
  resolveCurrent: (
    workspacePath?: string,
    page?: AgentDeliveryPage,
    agentId?: string,
  ) => Promise<AgentDeliveryDestination | null>;
}
