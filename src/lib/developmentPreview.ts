import { invoke } from "@tauri-apps/api/core";
export interface DevelopmentLaunch {
  relative_path: string;
  port: number;
}
export interface DevelopmentPlan {
  directory: string;
  url: string;
  running: boolean;
  launch: DevelopmentLaunch;
}
export const developmentPlan = (
  projectId: string,
  worktreePath: string,
  relativePath: string,
) =>
  invoke<DevelopmentPlan | null>("preview_development_plan", {
    projectId,
    worktreePath,
    relativePath,
  });
export const waitDevelopment = (port: number) =>
  invoke<void>("preview_development_wait", { port });

interface DevelopmentRequest {
  projectId: string;
  worktreePath: string;
  plan: DevelopmentPlan;
  resolve: () => void;
  reject: (reason: unknown) => void;
}
const listeners = new Set<(request: DevelopmentRequest) => void>();
export function listenDevelopment(
  listener: (request: DevelopmentRequest) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const starting = new Map<string, Promise<string>>();
export function startDevelopment(
  projectId: string,
  worktreePath: string,
  plan: DevelopmentPlan,
) {
  const key = JSON.stringify([projectId, worktreePath, plan.directory]);
  const previous = starting.get(key);
  if (previous) return previous;
  const pending = new Promise<void>((resolve, reject) => {
    if (!listeners.size)
      return reject(new Error("Project terminal is unavailable"));
    for (const listener of listeners)
      listener({ projectId, worktreePath, plan, resolve, reject });
  }).then(() => new URL(plan.url).origin);
  starting.set(key, pending);
  void pending.then(
    () => starting.delete(key),
    () => starting.delete(key),
  );
  return pending;
}
export interface DevelopmentTerminal {
  launch: DevelopmentLaunch;
  started: () => void;
  failed: (reason: unknown) => void;
}
