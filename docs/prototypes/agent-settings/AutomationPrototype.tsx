import { useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { AutomationPromptEditor } from "../../../src/components/AutomationPromptEditor";
import { AutomationScheduleInput } from "../../../src/components/AutomationScheduleInput";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import { ToggleSwitch } from "../../../src/components/ToggleSwitch";
import type { AutomationDraft } from "../../../src/lib/tauri";
import { automationDraft } from "./automationDraft";
import type { LaunchSettingsPrototype } from "./useLaunchSettingsPrototype";
import { AutomationLaunchField } from "./AutomationLaunchField";
import { taskLaunchGroup, type TaskLaunchChoice } from "./launchGroups";

export function AutomationPrototype({
  settings,
  onSettings,
}: {
  settings: LaunchSettingsPrototype;
  onSettings: () => void;
}) {
  const [draft, setDraft] = useState(automationDraft);
  const [choice, setChoice] = useState<TaskLaunchChoice>({
    agentKey: "codex",
    groupId: "",
  });
  // Saved task selection contains references only, never a scheme/command copy.
  const [saved, setSaved] = useState<{
    draft: AutomationDraft;
    choice: TaskLaunchChoice;
  } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const group = taskLaunchGroup(settings, choice);
  const available = settings.agents.some(
    (agent) =>
      agent.key === choice.agentKey && agent.installed && agent.enabled,
  );
  const valid = !choice.agentKey || (available && !!group?.command.trim());
  const update = (patch: Partial<AutomationDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setCancelled(false);
  };
  return (
    <form
      aria-label="编辑自动化"
      className="mx-auto flex h-full w-full max-w-[1400px] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          setSaved({ draft, choice });
          setCancelled(false);
        }
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
        <h1 className="text-lg font-semibold">编辑自动化</h1>
        <button
          type="button"
          className="app-button-ghost p-1.5"
          aria-label="返回 Agent 设置"
          onClick={onSettings}
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5 p-6 md:p-8">
          <input
            aria-label="任务名称"
            required
            maxLength={200}
            className="w-full border-0 bg-transparent text-2xl font-semibold tracking-tight text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
          />
          <input
            aria-label="任务描述"
            className="-mt-3 w-full bg-transparent text-sm leading-6 text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={draft.description ?? ""}
            onChange={(event) => update({ description: event.target.value })}
          />
          <label className="block space-y-2 text-xs font-medium text-muted">
            执行命令
            <textarea
              aria-label="自动化执行命令"
              className="app-input min-h-16 w-full font-mono text-sm"
              rows={2}
              value={draft.content}
              onChange={(event) => update({ content: event.target.value })}
            />
          </label>
          <AutomationPromptEditor
            draft={draft}
            disabled={false}
            inactivePrompt=""
            usesAgent={!!choice.agentKey}
            onChange={update}
          />
        </div>
        <aside className="min-w-0 space-y-6 border-t border-border-subtle bg-bg-secondary p-6 md:border-l md:border-t-0">
          <AutomationLaunchField
            settings={settings}
            choice={choice}
            onChange={(next) => {
              setChoice(next);
              setCancelled(false);
            }}
            onSettings={onSettings}
          />
          <label className="block space-y-2 text-xs font-medium text-muted">
            项目工作区
            <div className="flex items-center gap-2">
              <ThemedSelect
                aria-label="项目工作区"
                className="app-input min-w-0 flex-1"
                value={draft.workdir ?? ""}
                onChange={(event) => update({ workdir: event.target.value })}
              >
                <option value="~/projects/demo">demo</option>
                <option value="">不指定项目</option>
              </ThemedSelect>
              <FolderOpen className="h-4 w-4 shrink-0 text-muted" />
            </div>
            <span className="block break-all font-mono font-normal text-secondary">
              {draft.workdir || "未指定"}
            </span>
            <span className="block font-normal leading-5">
              自动切到所选项目目录执行任务。
            </span>
          </label>
          <label className="block space-y-2 text-xs font-medium text-muted">
            脚本目录
            <input
              className="app-input w-full font-mono text-xs"
              readOnly
              value="~/.agent-hub/automations/code-review"
            />
            <span className="block font-normal leading-5">
              保存脚本和提示词，切换项目不会移动脚本。
            </span>
          </label>
          <details className="rounded-lg border border-border-subtle bg-surface p-3 text-xs text-muted">
            <summary className="cursor-pointer">自定义操作</summary>
            <p className="mt-2 leading-5">此示例没有额外操作。</p>
          </details>
          <AutomationScheduleInput
            schedule={draft.schedule}
            provider="system"
            onChange={(schedule) => update({ schedule })}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-secondary">
            <span>启用日程</span>
            <ToggleSwitch
              checked={draft.enabled}
              title="启用日程"
              onChange={() => update({ enabled: !draft.enabled })}
            />
          </div>
          <p className="text-xs leading-5 text-muted">
            原型仅演示配置，不创建日程或启动 Agent。
          </p>
        </aside>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
        <div
          role="status"
          className="min-w-0 flex-1 text-xs leading-5 text-muted"
        >
          {!valid
            ? "请先选择有效的 Agent 和启动方案。"
            : cancelled
              ? "已恢复上次保存的任务配置。"
              : saved
                ? `已在原型中保存任务。${saved.choice.agentKey ? "启动方案与 Agent 设置保持同步。" : "不使用智能体。"}`
                : "保存后对后续执行生效，运行中的会话保持不变。"}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="app-button-secondary"
            onClick={() => {
              setDraft(saved?.draft ?? automationDraft());
              setChoice(saved?.choice ?? { agentKey: "codex", groupId: "" });
              setCancelled(true);
            }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="app-button-primary"
          >
            保存任务
          </button>
        </div>
      </footer>
    </form>
  );
}
