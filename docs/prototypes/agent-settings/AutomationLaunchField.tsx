import { Settings, Terminal, AlertTriangle } from "lucide-react";
import { HerdrIcon } from "../../../src/features/herdr/components/HerdrIcon";
import { AgentIcon } from "../../../src/components/AgentIcon";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import type { LaunchSettingsPrototype } from "./useLaunchSettingsPrototype";

import { taskLaunchGroup, type TaskLaunchChoice } from "./launchGroups";

export function AutomationLaunchField({
  settings,
  choice,
  onChange,
  onSettings,
}: {
  settings: LaunchSettingsPrototype;
  choice: TaskLaunchChoice;
  onChange: (choice: TaskLaunchChoice) => void;
  onSettings: () => void;
}) {
  const options = settings.agents.filter(
    (agent) => agent.installed && agent.enabled,
  );
  const selected = options.find((agent) => agent.key === choice.agentKey);
  const config = settings.groups[choice.agentKey];
  const group = taskLaunchGroup(settings, choice);
  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="text-xs font-medium text-muted">智能体（可选）</span>
        <ThemedSelect
          valueBadge={
            choice.agentKey ? (
              <span title="通过 Herdr 执行">
                <HerdrIcon className="h-4 w-4 text-muted" />
              </span>
            ) : undefined
          }
          aria-label="自动化智能体"
          value={choice.agentKey}
          onChange={(event) =>
            onChange({ agentKey: event.target.value, groupId: "" })
          }
          className="app-input w-full"
          leadingIcon={
            selected ? (
              <AgentIcon agentKey={selected.key} className="h-5 w-5" />
            ) : (
              <Terminal className="h-4 w-4" />
            )
          }
          optionIcon={(key) =>
            key ? (
              <AgentIcon agentKey={key} className="h-5 w-5" />
            ) : (
              <Terminal className="h-4 w-4" />
            )
          }
          menuFooterAction={{
            label: "智能体设置…",
            icon: <Settings size={16} />,
            onSelect: onSettings,
          }}
        >
          <option value="">不使用智能体</option>
          {options.map((agent) => (
            <option key={agent.key} value={agent.key}>
              {agent.display_name}
            </option>
          ))}
          {choice.agentKey && !selected && (
            <option value={choice.agentKey} disabled>
              所选 Agent 不可用
            </option>
          )}
        </ThemedSelect>
      </label>
      {choice.agentKey && (
        <>
          <label className="block space-y-2">
            <span className="text-xs font-medium text-muted">启动方案</span>
            <ThemedSelect
              aria-label="自动化启动方案"
              value={choice.groupId}
              onChange={(event) =>
                onChange({ ...choice, groupId: event.target.value })
              }
              className="app-input w-full"
              disabled={!selected}
              menuFooterAction={{
                label: "管理启动方案…",
                icon: <Settings size={16} />,
                onSelect: onSettings,
              }}
            >
              <option value="">跟随 Agent 默认方案</option>
              {(config?.groups ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.id === config.defaultId ? " · 默认" : ""}
                </option>
              ))}
              {choice.groupId && !group && (
                <option value={choice.groupId} disabled>
                  所选方案已删除
                </option>
              )}
            </ThemedSelect>
          </label>
          {!selected || !group ? (
            <p
              role="alert"
              className="flex items-start gap-2 text-xs leading-5 text-danger"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {!selected
                ? "所选 Agent 不可用，请重新选择。"
                : "所选方案已删除，请重新选择启动方案。"}
            </p>
          ) : (
            <div className="space-y-2 rounded-lg border border-border-subtle bg-surface p-3">
              <p className="text-xs text-muted">
                {choice.groupId
                  ? `使用：${group.name}`
                  : `当前默认：${group.name}`}
              </p>
              <code
                aria-label="自动化有效启动指令"
                className="block break-all font-mono text-xs leading-5 text-secondary"
              >
                {group.command || "启动指令为空，请在 Agent 设置中完善。"}
              </code>
              <p className="text-xs leading-5 text-muted">
                {choice.groupId
                  ? "与 Agent 设置保持同步。"
                  : "Agent 默认方案改变后，下次执行使用新默认。"}
              </p>
            </div>
          )}
        </>
      )}
      {!choice.agentKey && (
        <p className="text-xs leading-5 text-muted">
          直接执行任务命令，保留提示词草稿。
        </p>
      )}
    </div>
  );
}
