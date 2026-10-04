import { useEffect, useState } from "react";
import {
  readConfigSource,
  type ConfigDocument,
  type ConfigEditPreview,
  type InstructionFile,
} from "../lib/backend";
import { AGENT_SCHEMAS } from "../lib/config-schema";
import { Icon } from "./AppIcons";
import { ConfigFormEditor } from "./ConfigFormEditor";
import { DropdownMenu } from "./DropdownMenu";
import { InstructionFilesPanel } from "./InstructionFilesPanel";
import { PageNavigation } from "./PageNavigation";
import {
  agentMeta,
  getWorkspaceDisplayConfigs,
  instructionFileName,
  instructionKindLabel,
  statusLabel,
} from "./shell-presentation";

export function ConfigCenter({
  configs,
  workspaceConfigs,
  workspaceInstructions,
  workspacePath,
  onCreateInstructionLink,
  selectedScope,
  setSelectedScope,
  selectedAgent,
  setSelectedAgent,
  selectedConfig,
  editing,
  editMode,
  setEditMode,
  formState,
  setFormState,
  source,
  draft,
  setDraft,
  preview,
  saveMessage,
  onEdit,
  onCancel,
  onPreview,
  onSave,
  saving,
  searchQuery,
}: {
  configs: ConfigDocument[];
  workspaceConfigs: ConfigDocument[];
  workspaceInstructions: InstructionFile[];
  workspacePath: string;
  onCreateInstructionLink: () => Promise<{
    linkPath: string;
    targetPath: string;
  }>;
  selectedScope: ConfigDocument["scope"];
  setSelectedScope: (scope: ConfigDocument["scope"]) => void;
  selectedAgent: ConfigDocument["agent"];
  setSelectedAgent: (agent: ConfigDocument["agent"]) => void;
  selectedConfig?: ConfigDocument;
  editing: boolean;
  editMode: "form" | "source";
  setEditMode: (mode: "form" | "source") => void;
  formState: Record<string, unknown>;
  setFormState: (state: Record<string, unknown>) => void;
  source: string;
  draft: string;
  setDraft: (value: string) => void;
  preview?: ConfigEditPreview;
  saveMessage?: string;
  onEdit: () => void;
  onCancel: () => void;
  onPreview: () => void;
  onSave: () => void;
  saving: boolean;
  searchQuery: string;
}) {
  const [showSensitivePreview, setShowSensitivePreview] = useState(false);
  const [sensitivePreview, setSensitivePreview] = useState<string>();
  const [loadingSensitivePreview, setLoadingSensitivePreview] = useState(false);

  useEffect(() => {
    setShowSensitivePreview(false);
    setSensitivePreview(undefined);
    setLoadingSensitivePreview(false);
  }, [selectedConfig?.path]);

  const visibleConfigs =
    selectedScope === "global"
      ? configs
      : getWorkspaceDisplayConfigs(configs, workspaceConfigs);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredConfigs = normalizedQuery
    ? visibleConfigs.filter((config) => {
        const agentName = agentMeta[config.agent].name.toLocaleLowerCase();
        return [
          agentName,
          config.path,
          statusLabel(config.status),
          JSON.stringify(config.structuredView),
          workspacePath,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
    : visibleConfigs;
  const visibleInstructions =
    selectedScope === "workspace"
      ? workspaceInstructions.filter((instruction) => {
          if (!normalizedQuery) return true;
          return [
            instruction.path,
            instruction.kind,
            instructionKindLabel(instruction.kind),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        })
      : [];
  const configAgentOptions = (["claude-code", "codex", "opencode"] as const)
    .map((agent) => {
      const config = visibleConfigs.find((item) => item.agent === agent);
      const hasAgentsFile = workspaceInstructions.some(
        (instruction) => instructionFileName(instruction.path) === "AGENTS.md",
      );
      const hasClaudeInstruction = workspaceInstructions.some(
        (instruction) =>
          instructionFileName(instruction.path) === "CLAUDE.md" ||
          instructionFileName(instruction.path) === "CLAUDE.local.md",
      );
      const needsAttention =
        selectedScope === "workspace" &&
        agent === "claude-code" &&
        hasAgentsFile &&
        !hasClaudeInstruction;
      const meta = agentMeta[agent];
      return {
        value: agent,
        label: meta.name,
        description: config ? statusLabel(config.status) : "等待扫描",
        meta: (
          <span className="config-agent-option-meta">
            {config ? statusLabel(config.status) : "等待扫描"}
            {needsAttention && (
              <span title="工作空间配置未就绪">
                <Icon name="warning" size={13} aria-hidden="true" />
              </span>
            )}
          </span>
        ),
        leading: (
          <span className={`agent-avatar small ${meta.tone}`}>{meta.mark}</span>
        ),
      };
    })
    .filter((option) => {
      const installed = visibleConfigs.some(
        (config) => config.agent === option.value,
      );
      return (
        installed &&
        (!normalizedQuery ||
          filteredConfigs.some((config) => config.agent === option.value))
      );
    });

  const inheritedGlobalConfig =
    selectedScope === "workspace" && selectedConfig?.scope === "global";
  const displayedScopeLabel =
    selectedScope === "workspace" ? "工作空间" : "全局";

  const canRevealSensitivePreview =
    selectedConfig?.agent === "claude-code" &&
    selectedConfig.scope === "global" &&
    selectedConfig.status === "ready";

  async function toggleSensitivePreview() {
    if (
      !selectedConfig ||
      !canRevealSensitivePreview ||
      loadingSensitivePreview
    )
      return;
    if (showSensitivePreview) {
      setShowSensitivePreview(false);
      setSensitivePreview(undefined);
      return;
    }
    setLoadingSensitivePreview(true);
    try {
      const raw = await readConfigSource(selectedConfig.path);
      setSensitivePreview(raw);
      setShowSensitivePreview(true);
    } catch {
      setShowSensitivePreview(false);
    } finally {
      setLoadingSensitivePreview(false);
    }
  }

  if (editing && selectedConfig) {
    const meta = agentMeta[selectedConfig.agent];
    return (
      <div className="page config-edit-page">
        <PageNavigation
          backLabel="返回配置中心"
          onBack={onCancel}
          leading={
            <div className={`agent-avatar small ${meta.tone}`}>{meta.mark}</div>
          }
          title={`${meta.name} ${displayedScopeLabel}配置${inheritedGlobalConfig ? "（继承全局）" : ""}`}
          actions={
            <button className="button button-secondary" onClick={onPreview}>
              <Icon name="check" size={16} />
              生成 Diff
            </button>
          }
        />
        <div
          className="scope-switch edit-mode-switch"
          role="group"
          aria-label="编辑模式"
        >
          <button
            className={editMode === "form" ? "selected" : ""}
            aria-pressed={editMode === "form"}
            onClick={() => setEditMode("form")}
          >
            <Icon name="sliders" size={14} />
            表单
          </button>
          <button
            className={editMode === "source" ? "selected" : ""}
            aria-pressed={editMode === "source"}
            onClick={() => setEditMode("source")}
          >
            <Icon name="file" size={14} />
            源码
          </button>
        </div>
        {(selectedConfig.format === "jsonc" ||
          selectedConfig.format === "toml") &&
          editMode === "form" && (
            <p className="form-warning" role="status">
              <Icon name="warning" size={14} />
              表单模式会移除原始注释。若需保留注释，请使用源码模式。
            </p>
          )}
        <div className="config-edit-body">
          {editMode === "form" ? (
            <ConfigFormEditor
              schema={AGENT_SCHEMAS[selectedConfig.agent]}
              formState={formState}
              setFormState={setFormState}
              source={source}
              format={selectedConfig.format}
            />
          ) : (
            <div className="editor-block">
              <label className="editor-label" htmlFor="config-editor">
                配置原文
              </label>
              <textarea
                id="config-editor"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                spellCheck={false}
              />
              <div className="editor-hint">
                原始内容 {source.length.toLocaleString()} 字符
              </div>
            </div>
          )}
        </div>
        {preview && (
          <div className="diff-block">
            <div className="source-heading">
              <span>即将写入的变更</span>
              <span className={preview.changed ? "diff-changed" : ""}>
                {preview.changed ? "有变更" : "无变更"}
              </span>
            </div>
            <pre>{preview.diff}</pre>
            <div className="diff-actions">
              <button className="button button-ghost" onClick={onCancel}>
                取消
              </button>
              <button
                className="button button-primary"
                disabled={!preview.changed || saving}
                onClick={onSave}
              >
                {saving ? "保存中…" : "确认写入并备份"}
              </button>
            </div>
          </div>
        )}
        {saveMessage && (
          <p className="inline-message" role="status">
            {saveMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="sr-only">配置中心</h1>
      <div className="config-layout">
        <aside className="config-sidebar">
          <div className="scope-switch" role="group" aria-label="配置作用域">
            <button
              className={selectedScope === "global" ? "selected" : ""}
              aria-pressed={selectedScope === "global"}
              onClick={() => setSelectedScope("global")}
            >
              全局
            </button>
            <button
              className={selectedScope === "workspace" ? "selected" : ""}
              aria-pressed={selectedScope === "workspace"}
              disabled={
                !workspaceConfigs.length && !workspaceInstructions.length
              }
              onClick={() => setSelectedScope("workspace")}
            >
              工作空间
            </button>
          </div>
          <DropdownMenu
            className="config-agent-dropdown"
            options={configAgentOptions}
            value={selectedAgent}
            onChange={(value) => {
              setSelectedAgent(value as ConfigDocument["agent"]);
              onCancel();
            }}
            ariaLabel="选择配置 Agent"
            triggerCaption="当前配置"
            menuHeading="切换 Agent"
            menuCount={`${configAgentOptions.length} 个可用`}
            placeholder="暂无匹配 Agent"
          />
        </aside>
        <section className="config-detail">
          {selectedScope === "workspace" && workspacePath && (
            <div
              className="config-workspace-context"
              aria-label="当前工作空间目录"
            >
              <span className="config-workspace-context-label">
                当前工作空间
              </span>
              <code title={workspacePath}>{workspacePath}</code>
            </div>
          )}
          {selectedConfig ? (
            <>
              <div className="detail-heading">
                <div className="detail-title">
                  <div
                    className={`agent-avatar small ${agentMeta[selectedConfig.agent].tone}`}
                  >
                    {agentMeta[selectedConfig.agent].mark}
                  </div>
                  <div>
                    <h2>
                      {agentMeta[selectedConfig.agent].name}{" "}
                      {displayedScopeLabel}配置
                      {inheritedGlobalConfig ? "（继承全局）" : ""}
                    </h2>
                    <p>{selectedConfig.path}</p>
                  </div>
                </div>
                <div
                  className={`config-status status-${selectedConfig.status}`}
                >
                  <span className="status-dot" />
                  {statusLabel(selectedConfig.status)}
                </div>
              </div>
              {selectedScope === "workspace" &&
                selectedConfig.scope === "global" && (
                  <div className="config-effective-note" role="status">
                    <span aria-hidden="true">i</span>
                    <span>
                      当前工作空间未配置 {agentMeta[selectedConfig.agent].name}
                      ，实际生效的是全局配置。 编辑此处仍会修改全局配置文件。
                    </span>
                  </div>
                )}
              <div className="config-info-grid">
                <div>
                  <span>文件格式</span>
                  <strong>{selectedConfig.format.toUpperCase()}</strong>
                </div>
                <div>
                  <span>最后修改</span>
                  <strong>
                    {selectedConfig.modifiedAtMs
                      ? new Date(selectedConfig.modifiedAtMs).toLocaleString(
                          "zh-CN",
                        )
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>校验和</span>
                  <strong className="mono">
                    {selectedConfig.checksum
                      ? `${selectedConfig.checksum.slice(0, 12)}…`
                      : "—"}
                  </strong>
                </div>
              </div>
              {selectedConfig.diagnostics.length > 0 && (
                <div className="inline-diagnostics" role="status">
                  <Icon name="warning" size={17} />
                  <span>
                    <strong>
                      发现 {selectedConfig.diagnostics.length} 个诊断
                    </strong>
                    {selectedConfig.diagnostics[0].message}
                  </span>
                </div>
              )}
              <div className="source-block">
                <div className="source-heading">
                  <span>
                    <Icon name="file" size={16} />
                    遮罩预览
                  </span>
                  <span className="source-heading-actions">
                    <span>默认只读</span>
                    {canRevealSensitivePreview && (
                      <button
                        type="button"
                        className="source-reveal-button"
                        onClick={() => void toggleSensitivePreview()}
                        disabled={loadingSensitivePreview}
                        aria-pressed={showSensitivePreview}
                        aria-label={
                          showSensitivePreview ? "隐藏敏感值" : "显示敏感值"
                        }
                        title={
                          showSensitivePreview ? "隐藏敏感值" : "显示敏感值"
                        }
                      >
                        <Icon
                          name={showSensitivePreview ? "eye-off" : "eye"}
                          size={15}
                        />
                      </button>
                    )}
                  </span>
                </div>
                <pre className="source-preview">
                  {(showSensitivePreview
                    ? sensitivePreview
                    : selectedConfig.sourcePreview) || "暂无可读取的配置文件"}
                </pre>
                <div className="source-actions">
                  <button
                    className="button button-primary"
                    disabled={selectedConfig.status !== "ready"}
                    onClick={onEdit}
                  >
                    <Icon name="edit" size={16} />
                    编辑
                  </button>
                </div>
              </div>
              {selectedScope === "workspace" && (
                <InstructionFilesPanel
                  instructions={visibleInstructions}
                  total={workspaceInstructions.length}
                  searchQuery={normalizedQuery}
                  onCreateLink={onCreateInstructionLink}
                  agent={selectedAgent}
                />
              )}
            </>
          ) : normalizedQuery ? (
            <>
              {selectedScope === "workspace" && (
                <InstructionFilesPanel
                  instructions={visibleInstructions}
                  total={workspaceInstructions.length}
                  searchQuery={normalizedQuery}
                  onCreateLink={onCreateInstructionLink}
                  agent={selectedAgent}
                />
              )}
              <div className="empty-state large">
                <div className="empty-icon">
                  <Icon name="search" size={24} />
                </div>
                <h2>没有匹配的配置</h2>
                <p>试试搜索 Agent 名称、文件路径或状态，例如“Codex”。</p>
              </div>
            </>
          ) : (
            <>
              {selectedScope === "workspace" && (
                <InstructionFilesPanel
                  instructions={visibleInstructions}
                  total={workspaceInstructions.length}
                  searchQuery={normalizedQuery}
                  onCreateLink={onCreateInstructionLink}
                  agent={selectedAgent}
                />
              )}
              <div className="empty-state large">
                <div className="empty-icon">
                  <Icon name="file" size={24} />
                </div>
                <h2>还没有扫描结果</h2>
                <p>点击右上角"重新扫描"，AgentHub 会从本地读取配置状态。</p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
