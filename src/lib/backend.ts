import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
}

export interface UserDataLocation {
  path: string;
  bytes: number;
}

export interface UserDataPaths {
  root: UserDataLocation;
  database: UserDataLocation;
  backups: UserDataLocation;
  skillSources: UserDataLocation;
  logs: UserDataLocation;
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
export type SkillSourceKind =
  "preset-git" | "git" | "local-directory" | "marketplace" | "skills-sh";
export interface SkillSourceMetadata {
  kind: SkillSourceKind;
  locator: string;
  manifestPath: string | null;
  requestedRef: string | null;
  resolvedCommit: string | null;
}
export type DiagnosticCode =
  | "file_missing"
  | "permission_denied"
  | "json_syntax"
  | "jsonc_syntax"
  | "toml_syntax"
  | "schema_mismatch"
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
  storageKind: "copy" | "symlink";
  realPath: string;
  source: SkillSourceMetadata;
  displayName: string;
  name: string | null;
  relativePath: string;
  compatibility: string | null;
  currentVersion?: string | null;
  installedFingerprint?: string | null;
  enabled: boolean;
  sourceTracked: boolean;
  diagnostics: {
    code: string;
    message: string;
    severity: string;
    path: string | null;
    targetPath: string | null;
  }[];
}

export interface SkillInventory {
  skills: InstalledSkill[];
  duplicateNames: string[];
  roots: SkillRootUsage[];
  diagnostics: {
    code: string;
    message: string;
    severity: string;
    path: string | null;
    targetPath: string | null;
  }[];
}

export interface SkillRootUsage {
  path: string;
  bytes: number;
  skillCount: number;
}

export type SkillSourceRequest =
  | { kind: "local-directory"; path: string }
  | {
      kind: "git";
      url: string;
      requestedRef?: string | null;
      subdirectory?: string | null;
    }
  | { kind: "marketplace"; manifest: string }
  | { kind: "skills-sh"; ownerRepository: string };

export interface SkillSourceDiagnostic {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  path: string | null;
}

export interface DiscoveredSkill {
  source: SkillSourceMetadata;
  relativePath: string;
  entrypointPath: string;
  sourceDirectory: string;
  displayName: string;
  name: string | null;
  description: string | null;
  license: string | null;
  compatibility: string | null;
  metadata: Record<string, string>;
  rawFrontmatter: string | null;
  installable: boolean;
  diagnostics: SkillSourceDiagnostic[];
}

export interface MarketplaceEntry {
  name: string | null;
  description: string | null;
  version: string | null;
  author: string | null;
  homepage: string | null;
  compatibility: unknown;
  source: unknown;
  raw: unknown;
  installable: boolean;
  diagnostics: SkillSourceDiagnostic[];
}

export interface SkillSourceBrowseResult {
  source: SkillSourceMetadata;
  skills: DiscoveredSkill[];
  catalogEntries: MarketplaceEntry[];
  diagnostics: SkillSourceDiagnostic[];
}

export interface SkillInstallPlan {
  skillKey: string;
  sourceKind: SkillSourceKind;
  sourceLocator: string;
  sourceRevision: string | null;
  sourceFingerprint: string;
  agent: Agent;
  scope: ConfigScope;
  sourceDirectory: string;
  targetRoot: string;
  targetDirectory: string;
  files: string[];
}

export interface SkillInstallPlanPreview {
  planId: string;
  plan: SkillInstallPlan;
  source: SkillSourceMetadata;
  displayName: string;
  description: string | null;
}

export interface ManagedInstallation {
  skillKey: string;
  sourceLocator: string;
  sourceKind: SkillSourceKind | null;
  agent: Agent;
  scope: ConfigScope;
  targetDirectory: string;
  files: string[];
  sourceRevision: string | null;
  installedFingerprint: string;
  enabled: boolean;
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

export interface ConfigHistoryRecord {
  id: number;
  configFileId: number | null;
  agent: Agent;
  scope: ConfigScope;
  path: string;
  format: ConfigFormat;
  operationType: "edit" | "rollback";
  beforeChecksum: string | null;
  afterChecksum: string | null;
  backupId: number;
  backupPath: string;
  result: "succeeded" | "failed";
  diagnosticCode: string | null;
  createdAt: string;
}

export interface WorkspaceRecord {
  id: number;
  displayName: string;
  enteredPath: string;
  normalizedPath: string;
  canonicalPath: string | null;
}

export interface InstructionFile {
  path: string;
  kind: string;
  scope: ConfigScope;
}

export interface WorkspaceScanResult {
  workspace: WorkspaceRecord;
  configs: ConfigDocument[];
  skills: SkillInventory;
  instructions: InstructionFile[];
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

export type RecoveryAction =
  | "rescan_resource"
  | "reload_resource"
  | "create_config"
  | "edit_config"
  | "restore_backup"
  | "resolve_duplicate_skill"
  | "refresh_skill_source"
  | "review_version_compatibility"
  | "review_permissions"
  | "repair_storage";

export interface DiagnosticRecoveryRequest {
  diagnosticCode: string;
  resourcePath?: string;
  action?: RecoveryAction;
  recoveryId?: string;
  format?: ConfigFormat;
  replacement?: string;
  expectedChecksum?: string;
  previewed?: boolean;
  confirmed?: boolean;
}

export interface DiagnosticRecoveryPlan {
  diagnosticCode: string;
  action: RecoveryAction;
  resourcePath: string | null;
  safety: "safe" | "requires_confirmation" | "manual";
  previewRequired: boolean;
  confirmationRequired: boolean;
}

export interface DiagnosticRecoveryPreview {
  recoveryId: string;
  plan: DiagnosticRecoveryPlan;
  summary: string;
  nextCommand: string | null;
  configPreview: ConfigEditPreview | null;
}

export interface DiagnosticRecoveryResult {
  recoveryId: string;
  action: RecoveryAction;
  outcome: "refreshed" | "applied";
  resourcePath: string | null;
  nextCommand: string | null;
  diagnostics: UnifiedDiagnostic[];
  diagnosticsRefreshed: boolean;
  configWrite: ConfigWriteResult | null;
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

export function getUserDataPaths(): Promise<UserDataPaths> {
  return invoke<UserDataPaths>("user_data_paths");
}

export function clearUserData(
  kind: "backups" | "logs" | "skillSources",
): Promise<UserDataPaths> {
  return invoke<UserDataPaths>("clear_user_data", { kind });
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

export function browseSkillSource(
  request: SkillSourceRequest,
): Promise<SkillSourceBrowseResult> {
  return invoke<SkillSourceBrowseResult>("browse_skill_source", { request });
}

export function planSkillInstall(input: {
  request: SkillSourceRequest;
  skillPath: string;
  skillSourceLocator?: string;
  agent: Agent;
  scope: ConfigScope;
  workspaceDirectory?: string;
  workspaceId?: number;
}): Promise<SkillInstallPlanPreview> {
  return invoke<SkillInstallPlanPreview>("plan_skill_install", { input });
}

export function applySkillInstall(
  planId: string,
): Promise<ManagedInstallation> {
  return invoke<ManagedInstallation>("apply_skill_install", { planId });
}

export function setSkillEnabled(input: {
  targetDirectory: string;
  enabled: boolean;
  workspaceDirectory?: string;
}): Promise<ManagedInstallation> {
  return invoke<ManagedInstallation>("set_skill_enabled", input);
}

export function uninstallSkill(input: {
  targetDirectory: string;
  workspaceDirectory?: string;
}): Promise<ManagedInstallation> {
  return invoke<ManagedInstallation>("uninstall_skill", input);
}

export type LegacyCodexSkillAction = "migrate" | "archive";

export interface LegacyCodexSkillResolution {
  action: LegacyCodexSkillAction;
  originalPath: string;
  destinationPath: string;
  backupPath: string;
}

export function resolveLegacyCodexSkill(input: {
  sourcePath: string;
  action: LegacyCodexSkillAction;
}): Promise<LegacyCodexSkillResolution> {
  return invoke<LegacyCodexSkillResolution>("resolve_legacy_codex_skill", {
    input,
  });
}

export function getDiagnostics(
  filters: {
    severity?: DiagnosticSeverity;
    agent?: Agent;
    scope?: ConfigScope;
    resourcePath?: string;
  } = {},
): Promise<UnifiedDiagnostic[]> {
  return invoke<UnifiedDiagnostic[]>("collect_diagnostics", filters);
}

export function previewDiagnosticRecovery(
  request: DiagnosticRecoveryRequest,
): Promise<DiagnosticRecoveryPreview> {
  return invoke<DiagnosticRecoveryPreview>("preview_diagnostic_recovery", {
    request,
  });
}

export function executeDiagnosticRecovery(
  request: DiagnosticRecoveryRequest,
): Promise<DiagnosticRecoveryResult> {
  return invoke<DiagnosticRecoveryResult>("execute_diagnostic_recovery", {
    request,
  });
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

export function readSkillSource(path: string): Promise<string> {
  return invoke<string>("read_skill_source", { path });
}

export function openDirectoryInEditor(path: string): Promise<boolean> {
  return invoke<boolean>("open_directory_in_editor", { path });
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

export function rollbackConfig(
  path: string,
  format: ConfigFormat,
  expectedChecksum: string,
  backupPath: string,
): Promise<ConfigWriteResult> {
  return invoke<ConfigWriteResult>("rollback_config", {
    path,
    format,
    expectedChecksum,
    backupPath,
  });
}

export function listConfigHistory(
  path?: string,
): Promise<ConfigHistoryRecord[]> {
  return invoke<ConfigHistoryRecord[]>("list_config_history", { path });
}

export function getConfigHistoryEntry(
  operationId: number,
): Promise<ConfigHistoryRecord | null> {
  return invoke<ConfigHistoryRecord | null>("get_config_history_entry", {
    operationId,
  });
}

export function previewConfigRestore(
  operationId: number,
): Promise<ConfigEditPreview> {
  return invoke<ConfigEditPreview>("preview_config_restore", { operationId });
}

export function restoreConfigHistory(
  operationId: number,
  expectedChecksum: string,
): Promise<ConfigWriteResult> {
  return invoke<ConfigWriteResult>("restore_config_history", {
    operationId,
    expectedChecksum,
  });
}
