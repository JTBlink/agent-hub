import type { GithubBackupConnectResult } from "../../lib/tauri";
export interface GithubBackupConnectProps {
  reconnect: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onConnected: (result: GithubBackupConnectResult) => Promise<void>;
  mapGitError: (error: unknown) => string;
}

export interface GithubBackupRemoteActionsProps {
  remoteUrl: string;
  authMethod: string;
  busy: boolean;
  onDisconnect: () => Promise<void>;
}
