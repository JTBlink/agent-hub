import { useEffect, useState } from "react";
import { type ConfigDocument, type InstructionFile } from "../lib/backend";
import { Icon } from "./AppIcons";
import { useConfirm } from "./Modal";
import {
  errorMessage,
  instructionFileName,
  instructionKindLabel,
} from "./shell-presentation";

export function InstructionFilesPanel({
  instructions,
  total,
  searchQuery,
  onCreateLink,
  agent,
}: {
  instructions: InstructionFile[];
  total: number;
  searchQuery: string;
  onCreateLink: () => Promise<{ linkPath: string; targetPath: string }>;
  agent: ConfigDocument["agent"];
}) {
  const hasAgentsFile = instructions.some(
    (instruction) => instructionFileName(instruction.path) === "AGENTS.md",
  );
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string>();
  const [toast, setToast] = useState<string>();
  const { confirm, ConfirmPortal } = useConfirm();
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  async function createLink() {
    if (creatingLink || !hasAgentsFile || agent !== "claude-code") return;
    const confirmed = await confirm({
      title: "创建 Claude Code 软链接？",
      description: (
        <p>
          将在当前项目根目录的 <code>CLAUDE.md</code> 创建软链接，指向
          <code>AGENTS.md</code>。如果目标已存在真实文件，AgentHub 不会覆盖它。
        </p>
      ),
      confirmLabel: "确认创建",
      cancelLabel: "取消",
    });
    if (!confirmed) return;
    setCreatingLink(true);
    setLinkMessage(undefined);
    try {
      const result = await onCreateLink();
      setToast(`软链接：${result.linkPath} → 真实文件：${result.targetPath}`);
    } catch (error) {
      setLinkMessage(
        errorMessage(error, "软链接创建失败，请检查工作空间权限。"),
      );
    } finally {
      setCreatingLink(false);
    }
  }
  return (
    <>
      <section
        className="instruction-files-panel"
        aria-labelledby="instruction-files-title"
      >
        <div className="instruction-files-heading">
          <div>
            <p className="eyebrow">工作空间上下文</p>
            <h3 id="instruction-files-title">指令文件</h3>
          </div>
          <div className="instruction-files-heading-actions">
            <span className="instruction-files-count">
              {searchQuery ? `${instructions.length} / ${total}` : total} 个
            </span>
            <button
              className="button button-secondary"
              type="button"
              disabled={
                !hasAgentsFile || creatingLink || agent !== "claude-code"
              }
              onClick={() => void createLink()}
            >
              {creatingLink
                ? "创建中…"
                : agent !== "claude-code"
                  ? "当前 Agent 无需软链接"
                  : hasAgentsFile
                    ? "创建 Claude Code 软链接"
                    : "请先创建 AGENTS.md"}
            </button>
          </div>
        </div>
        {linkMessage && (
          <p className="inline-message" role="status">
            {linkMessage}
          </p>
        )}
        {!hasAgentsFile && (
          <p className="instruction-files-empty">
            请先在工作空间根目录创建真实的 AGENTS.md 文件，再创建 Claude Code
            软链接。
          </p>
        )}
        {instructions.length ? (
          <div className="instruction-files-list">
            {instructions.map((instruction) => (
              <article className="instruction-file-row" key={instruction.path}>
                <div className="instruction-file-icon">
                  <Icon name="file" size={16} />
                </div>
                <div className="instruction-file-copy">
                  <strong>{instructionFileName(instruction.path)}</strong>
                  <span>
                    {instructionKindLabel(instruction.kind)} ·{" "}
                    {instruction.isSymlink ? "软链接" : "真实文件"}
                  </span>
                  <code title={instruction.path}>{instruction.path}</code>
                </div>
                <span className="instruction-readonly">
                  {instruction.isSymlink ? "软链接" : "真实文件"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="instruction-files-empty">
            {searchQuery
              ? "没有匹配的软链接提示。"
              : "当前工作空间没有发现 AGENTS.md 或 CLAUDE.md，可创建软链接复用指令。"}
          </p>
        )}
      </section>
      {toast && (
        <div className="workspace-toast" role="status" aria-live="polite">
          <Icon name="check" size={16} />
          <span>{toast}</span>
        </div>
      )}
      {ConfirmPortal}
    </>
  );
}
