import type { ComponentType, SVGProps } from "react";

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
export function agentDeliveryTabTitle(page: AgentDeliveryPage): string {
  return (
    page.path
      ?.split(/[\\/]/)
      .at(-1)
      ?.replace(/\p{Cc}/gu, " ")
      .trim() ||
    page.title.replace(/\p{Cc}/gu, " ").trim() ||
    "Preview"
  ).slice(0, 80);
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
  /** Optional launch host branding, supplied by the workbench composition. */
  launchHost?: {
    name: string;
    Icon: ComponentType<SVGProps<SVGSVGElement>>;
  };
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
