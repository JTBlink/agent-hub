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
/** The workbench composes providers; preview never imports a provider's internals. */
export interface AgentDeliveryAdapter {
  id: string;
  label: string;
  resolveCurrent: (
    workspacePath?: string,
    page?: AgentDeliveryPage,
  ) => Promise<AgentDeliveryDestination | null>;
}
