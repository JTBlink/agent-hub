import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
}

export interface StorageDiagnostics {
  databasePath: string;
  schemaVersion: number;
  journalMode: string;
  foreignKeysEnabled: boolean;
  forbiddenSchemaColumns: string[];
}

export type Agent = "claude-code" | "codex" | "opencode";
export type ConfigScope = "global" | "workspace";
export type ConfigFormat = "json" | "jsonc" | "toml" | "yaml" | "markdown";
export type ConfigStatus = "ready" | "missing" | "invalid" | "unreadable";
export type DiagnosticCode =
  | "file_missing"
  | "permission_denied"
  | "json_syntax"
  | "jsonc_syntax"
  | "toml_syntax"
  | "io_failure";

export interface ConfigDiagnostic {
  code: DiagnosticCode;
  message: string;
  line: number | null;
  column: number | null;
}

export interface ConfigDocument {
  agent: Agent;
  scope: ConfigScope;
  format: ConfigFormat;
  path: string;
  status: ConfigStatus;
  checksum: string | null;
  modifiedAtMs: number | null;
  structuredView: unknown;
  sourcePreview: string;
  diagnostics: ConfigDiagnostic[];
}

export interface InstalledSkill {
  agent: Agent;
  scope: ConfigScope;
  path: string;
  displayName: string;
  relativePath: string;
  sourceTracked: boolean;
  diagnostics: {
    code: string;
    message: string;
    severity: string;
    path: string | null;
  }[];
}

export interface SkillInventory {
  skills: InstalledSkill[];
  duplicateNames: string[];
  diagnostics: {
    code: string;
    message: string;
    severity: string;
    path: string | null;
  }[];
}

export interface ConfigEditPreview {
  path: string;
  before: { checksum: string; byteSize: number; modifiedAtMs: number | null };
  afterChecksum: string;
  changed: boolean;
  diff: string;
}

export interface ConfigWriteResult {
  path: string;
  before: { checksum: string; byteSize: number; modifiedAtMs: number | null };
  after: { checksum: string; byteSize: number; modifiedAtMs: number | null };
  backupPath: string;
}

export interface WorkspaceRecord {
  id: number;
  displayName: string;
  enteredPath: string;
  normalizedPath: string;
  canonicalPath: string | null;
}

export interface WorkspaceScanResult {
  workspace: WorkspaceRecord;
  configs: ConfigDocument[];
  skills: SkillInventory;
  instructions: { path: string; kind: string; scope: ConfigScope }[];
}

export type DiagnosticSeverity = "info" | "warning" | "error";
export interface UnifiedDiagnostic {
  code: string;
  kind: string;
  severity: DiagnosticSeverity;
  agent: Agent | null;
  scope: ConfigScope | null;
  resourcePath: string | null;
  impact: string;
  nextAction: string;
  fixSafety: "safe" | "requires_confirmation" | "manual";
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

export function getStorageDiagnostics(): Promise<StorageDiagnostics> {
  return invoke<StorageDiagnostics>("storage_diagnostics");
}

export function getClaudeGlobalConfig(): Promise<ConfigDocument> {
  return invoke<ConfigDocument>("scan_claude_global");
}

export function getCodexGlobalConfig(): Promise<ConfigDocument> {
  return invoke<ConfigDocument>("scan_codex_global");
}

export function getOpenCodeGlobalConfig(): Promise<ConfigDocument> {
  return invoke<ConfigDocument>("scan_opencode_global");
}

export function getSkillInventory(
  workspaceDirectory?: string,
): Promise<SkillInventory> {
  return invoke<SkillInventory>("scan_skills", { workspaceDirectory });
}

export function getDiagnostics(
  filters: {
    severity?: DiagnosticSeverity;
    agent?: Agent;
    scope?: ConfigScope;
  } = {},
): Promise<UnifiedDiagnostic[]> {
  return invoke<UnifiedDiagnostic[]>("collect_diagnostics", filters);
}

export function listWorkspaces(): Promise<WorkspaceRecord[]> {
  return invoke<WorkspaceRecord[]>("list_workspaces");
}

export function addWorkspace(path: string): Promise<WorkspaceRecord> {
  return invoke<WorkspaceRecord>("add_workspace", { path });
}

export function removeWorkspace(workspaceId: number): Promise<boolean> {
  return invoke<boolean>("remove_workspace", { workspaceId });
}

export function scanWorkspace(path: string): Promise<WorkspaceScanResult> {
  return invoke<WorkspaceScanResult>("scan_workspace", { path });
}

export function previewConfigEdit(
  path: string,
  format: ConfigFormat,
  replacement: string,
): Promise<ConfigEditPreview> {
  return invoke<ConfigEditPreview>("preview_config_edit", {
    path,
    format,
    replacement,
  });
}

export function readConfigSource(path: string): Promise<string> {
  return invoke<string>("read_config_source", { path });
}

export function writeConfig(
  path: string,
  format: ConfigFormat,
  expectedChecksum: string,
  replacement: string,
): Promise<ConfigWriteResult> {
  return invoke<ConfigWriteResult>("write_config", {
    path,
    format,
    expectedChecksum,
    replacement,
  });
}
