import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { SkillSourceRequest } from "./backend";

export interface DeepLinkInstallRequest {
  pluginName: string;
  marketplace: string;
  catalogKey: string;
}

export interface DeepLinkResolution {
  pluginName: string;
  description: string | null;
  author: string | null;
  category: string | null;
  homepage: string | null;
  sourceRequest: SkillSourceRequest;
}

export function listenForDeepLinkInstall(
  handler: (request: DeepLinkInstallRequest) => void,
): Promise<() => void> {
  return listen<DeepLinkInstallRequest>("deep-link-install", (event) =>
    handler(event.payload),
  );
}

export function listenForDeepLinkError(
  handler: (message: string) => void,
): Promise<() => void> {
  return listen<string>("deep-link-error", (event) => handler(event.payload));
}

export function resolveDeepLinkInstall(
  pluginName: string,
  marketplace: string,
): Promise<DeepLinkResolution> {
  return invoke<DeepLinkResolution>("resolve_deep_link_install", {
    pluginName,
    marketplace,
  });
}
