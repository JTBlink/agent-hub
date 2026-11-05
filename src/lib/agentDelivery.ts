/** A destination owns its transport and final identity validation. */
export interface AgentDeliveryDestination {
  send: (prompt: string) => Promise<unknown>;
}
/** The workbench composes providers; preview never imports a provider's internals. */
export interface AgentDeliveryAdapter {
  id: string;
  label: string;
  resolveCurrent: (
    workspacePath?: string,
  ) => Promise<AgentDeliveryDestination | null>;
}
