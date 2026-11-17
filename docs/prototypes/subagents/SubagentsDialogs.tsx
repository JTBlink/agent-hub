import { useState } from "react";
import { Check } from "lucide-react";
import { AppDialog } from "../../../src/components/AppDialog";
import { ToggleSwitch } from "../../../src/components/ToggleSwitch";
import { cn } from "../../../src/utils";
import { AGENTS, ROLES, type AgentKey } from "./subagentsData";
import { Field } from "./SubagentsParts";
export function AddDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: () => void;
}) {
  const [workspace, setWorkspace] = useState<"global" | "work-native-ui">(
    "global",
  );
  const [targets, setTargets] = useState<Record<AgentKey, boolean>>({
    claude_code: true,
    codex: true,
    cursor: false,
  });
  const [mode, setMode] = useState<"symlink" | "copy">("symlink");
  const preview = (["claude_code", "codex"] as AgentKey[])
    .filter((key) => targets[key])
    .map((key) =>
      workspace === "global"
        ? `~/${key === "claude_code" ? ".claude" : ".codex"}/agents/<角色>.${key === "claude_code" ? "md" : "toml"}`
        : `.${key === "claude_code" ? "claude" : "codex"}/agents/<角色>.${key === "claude_code" ? "md" : "toml"} → ../../.agents/subagents/<角色>/native/${AGENTS[key].format}`,
    );

  return (
    <AppDialog title="添加到工作空间" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <Field label="工作空间">
          <div className="space-y-1.5">
            {[
              {
                id: "global" as const,
                name: "全局",
                hint: "部署到每个 Agent 的用户级目录",
              },
              {
                id: "work-native-ui" as const,
                name: "work-native-ui",
                hint: "写入项目中央库并生成团队入口",
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setWorkspace(item.id)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border p-2 text-left transition-colors",
                  workspace === item.id
                    ? "border-accent bg-accent-bg"
                    : "border-border-subtle bg-surface hover:bg-surface-hover",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                    workspace === item.id
                      ? "border-accent bg-accent text-[var(--color-on-accent)]"
                      : "border-border",
                  )}
                >
                  {workspace === item.id && <Check className="h-3 w-3" />}
                </span>
                <span>
                  <b className="block text-sm">{item.name}</b>
                  <small className="block text-xs text-muted">
                    {item.hint}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="目标 Agent">
          <div className="space-y-1.5">
            {(Object.keys(AGENTS) as AgentKey[]).map((key) => (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-2 rounded-md border p-2",
                  targets[key]
                    ? "border-accent bg-accent-bg"
                    : "border-border-subtle bg-surface",
                  !AGENTS[key].installed && "opacity-50",
                )}
              >
                <ToggleSwitch
                  checked={targets[key]}
                  disabled={!AGENTS[key].installed}
                  onChange={() =>
                    setTargets((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                  title={AGENTS[key].name}
                />
                <span className="min-w-0">
                  <b className="block text-sm">{AGENTS[key].name}</b>
                  <small className="block font-mono text-xs text-muted">
                    {AGENTS[key].format}
                  </small>
                </span>
                <span className="ml-auto text-xs text-muted">
                  {AGENTS[key].installed ? "已安装 · 已启用" : "未安装"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            未安装的 Agent 不可选；已安装但停用的仍可部署，启用后生效。
          </p>
        </Field>

        <Field label="入口方式">
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                id: "symlink" as const,
                name: "链接（推荐）",
                hint: "相对软链接指向中央内容，改契约即生效",
              },
              {
                id: "copy" as const,
                name: "复制副本",
                hint: "无法创建软链接的环境使用，需手动刷新",
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  "rounded-md border p-2 text-left",
                  mode === item.id
                    ? "border-accent bg-accent-bg"
                    : "border-border-subtle bg-surface hover:bg-surface-hover",
                )}
              >
                <b className="block text-sm">{item.name}</b>
                <small className="block text-xs text-muted">{item.hint}</small>
              </button>
            ))}
          </div>
        </Field>

        <Field label="将写入">
          <pre className="app-panel overflow-auto p-3 font-mono text-xs leading-6 whitespace-pre-wrap text-muted">
            {preview.join("\n") || "未选择目标 Agent"}
          </pre>
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary"
          >
            取消
          </button>
          <button type="button" onClick={onAdd} className="app-button-primary">
            添加
          </button>
        </div>
      </div>
    </AppDialog>
  );
}

export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: () => void;
}) {
  return (
    <AppDialog title="导入" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-accent-border bg-accent-bg p-3 text-xs">
          <b className="mb-0.5 block text-primary">已发现 3 个角色</b>
          <span className="text-secondary">
            developer、reviewer、tester，各带 native/claude.md 与
            native/codex.toml。现有文件按原样保留，只登记身份与内容指纹。
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2 rounded-md border border-accent bg-accent-bg p-2">
            <span className="mt-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-accent bg-accent text-[var(--color-on-accent)]">
              <Check className="h-3 w-3" />
            </span>
            <span>
              <b className="block text-sm">登记项目中央库</b>
              <small className="block text-xs text-muted">
                .agents/subagents 即团队实际内容，改动随项目 Git
              </small>
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface p-2">
            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-border" />
            <span>
              <b className="block text-sm">同时复制到个人库</b>
              <small className="block text-xs text-muted">
                个人库持有契约，项目保留副本
              </small>
            </span>
          </div>
        </div>
        <Field label="契约文件名识别">
          <p className="text-xs text-muted">
            规范名为 AGENT.md；项目里已有 worker.md
            时登记为别名，两者同时存在时提示合并，不猜测内容。
          </p>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onImport}
            className="app-button-primary"
          >
            登记
          </button>
        </div>
      </div>
    </AppDialog>
  );
}

export function CommitDialog({ onClose }: { onClose: () => void }) {
  return (
    <AppDialog title="需提交文件" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted">
          AgentHub 只列出文件，不执行 commit 或 push。
        </p>
        <pre className="app-panel overflow-auto p-3 font-mono text-xs leading-6 whitespace-pre-wrap text-muted">
          {ROLES.flatMap((role) => [
            `.agents/subagents/${role.id}/${role.contract}`,
            `.agents/subagents/${role.id}/native/claude.md`,
            `.agents/subagents/${role.id}/native/codex.toml`,
          ])
            .concat([
              ".agents/subagents/roles.md",
              ".claude/agents/reviewer.md   ← 外部修改，提交前确认",
            ])
            .join("\n")}
        </pre>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary"
          >
            关闭
          </button>
        </div>
      </div>
    </AppDialog>
  );
}

export function ConflictDialog({
  onClose,
  onResolve,
}: {
  onClose: () => void;
  onResolve: () => void;
}) {
  return (
    <AppDialog title="检测到外部修改" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-muted">
          .claude/agents/reviewer.md
          内容与仓库内契约渲染结果不一致，可能被手工编辑或由其他工具写入。
        </p>
        <pre className="app-panel overflow-auto p-3 font-mono text-xs leading-6 text-secondary">
          <span className="text-danger">- tools: Read, Grep, Glob</span>
          {"\n"}
          <span className="text-success">+ 只读审查，禁止写入任何文件</span>
          {"\n"}
          <span className="text-success">+ 发现问题先报告，不直接修复</span>
        </pre>
        <div className="space-y-1.5">
          {[
            {
              name: "保留文件，标记为已修改",
              hint: "不再自动覆盖；下次渲染前提示",
              active: true,
            },
            {
              name: "用契约覆盖",
              hint: "丢弃文件中的手工修改，恢复为渲染结果",
              active: false,
            },
            {
              name: "把文件内容接回契约",
              hint: "以文件为准更新 AGENT.md，再重新渲染全部入口",
              active: false,
            },
          ].map((option) => (
            <div
              key={option.name}
              className={cn(
                "flex items-start gap-2 rounded-md border p-2",
                option.active
                  ? "border-accent bg-accent-bg"
                  : "border-border-subtle bg-surface",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                  option.active
                    ? "border-accent bg-accent text-[var(--color-on-accent)]"
                    : "border-border",
                )}
              >
                {option.active && <Check className="h-3 w-3" />}
              </span>
              <span>
                <b className="block text-sm">{option.name}</b>
                <small className="block text-xs text-muted">
                  {option.hint}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onResolve}
            className="app-button-primary"
          >
            确定
          </button>
        </div>
      </div>
    </AppDialog>
  );
}
