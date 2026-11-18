import { useState } from "react";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { AppDialog } from "../../../src/components/AppDialog";
import { CardActionMenu } from "../../../src/components/CardActionMenu";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import {
  initialGroups,
  type AgentGroups,
  type LaunchGroup,
} from "./launchGroups";

export function LaunchGroupEditor({
  agentKey,
  name,
  value,
  onChange,
}: {
  agentKey: string;
  name: string;
  value: AgentGroups;
  onChange: (next: AgentGroups) => void;
}) {
  const [selectedId, setSelectedId] = useState(value.defaultId);
  const current =
    value.groups.find((group) => group.id === selectedId) ?? value.groups[0];
  const [dialog, setDialog] = useState<"new" | "rename" | "delete" | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [copyCurrent, setCopyCurrent] = useState(true);
  const [error, setError] = useState("");
  const isDefault = current.id === value.defaultId;
  const update = (patch: Partial<LaunchGroup>) =>
    onChange({
      ...value,
      groups: value.groups.map((group) =>
        group.id === current.id ? { ...group, ...patch } : group,
      ),
    });
  const open = (mode: "new" | "rename" | "delete") => {
    setDraft(mode === "rename" ? current.name : "");
    setCopyCurrent(true);
    setError("");
    setDialog(mode);
  };
  const save = () => {
    const nextName = draft.trim();
    if (!nextName) {
      setError("请输入方案名称");
      return;
    }
    if (
      value.groups.some(
        (group) =>
          group.name === nextName &&
          (dialog === "new" || group.id !== current.id),
      )
    ) {
      setError("该 Agent 已有同名方案");
      return;
    }
    if (dialog === "rename") update({ name: nextName });
    else {
      const group = {
        id: crypto.randomUUID(),
        name: nextName,
        command: copyCurrent
          ? current.command
          : (initialGroups[agentKey]?.groups[0].command ?? agentKey),
      };
      onChange({ ...value, groups: [...value.groups, group] });
      setSelectedId(group.id);
    }
    setDialog(null);
  };
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-secondary">启动方案</span>
        <ThemedSelect
          aria-label={`${name} 启动方案`}
          value={current.id}
          onChange={(event) => setSelectedId(event.target.value)}
          className="app-input min-w-0 flex-1 text-xs"
        >
          {value.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
              {group.id === value.defaultId ? " · 默认" : ""}
            </option>
          ))}
        </ThemedSelect>
        <button
          type="button"
          title="新建启动方案"
          aria-label={`${name} 新建启动方案`}
          className="app-button-ghost p-1.5"
          onClick={() => open("new")}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <CardActionMenu
          label={`${name} 方案操作`}
          actions={[
            {
              key: "rename",
              label: "重命名",
              icon: <Pencil className="h-3.5 w-3.5" />,
              onSelect: () => open("rename"),
            },
            {
              key: "copy",
              label: "复制为新方案",
              icon: <Copy className="h-3.5 w-3.5" />,
              onSelect: () => {
                open("new");
                setDraft(`${current.name} 副本`);
              },
            },
            {
              key: "default",
              label: isDefault ? "已是默认方案" : "设为默认方案",
              icon: <Star className="h-3.5 w-3.5" />,
              disabled: isDefault,
              onSelect: () => onChange({ ...value, defaultId: current.id }),
            },
            {
              key: "delete",
              label: "删除方案",
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              disabled: value.groups.length === 1,
              separatorBefore: true,
              onSelect: () => open("delete"),
            },
          ]}
        />
      </div>
      <label className="block text-xs text-secondary">
        启动指令
        <input
          aria-label={`${name} 启动指令`}
          spellCheck={false}
          value={current.command}
          onChange={(event) => update({ command: event.target.value })}
          className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          {isDefault
            ? "快捷启动使用此方案"
            : `快捷启动：${value.groups.find((group) => group.id === value.defaultId)?.name}`}
        </span>
        {!isDefault && (
          <button
            type="button"
            className="text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => onChange({ ...value, defaultId: current.id })}
          >
            设为默认方案
          </button>
        )}
      </div>
      {dialog && (
        <AppDialog
          title={
            dialog === "delete"
              ? "删除启动方案"
              : dialog === "rename"
                ? "重命名启动方案"
                : `${name} · 新建启动方案`
          }
          onClose={() => setDialog(null)}
        >
          {dialog === "delete" ? (
            <>
              <p className="text-sm text-secondary">
                删除“{current.name}”？已运行的会话不受影响。
              </p>
              {isDefault && (
                <p className="mt-3 text-xs text-muted">
                  删除后，“
                  {value.groups.find((group) => group.id !== current.id)?.name}
                  ”将成为默认方案。
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => setDialog(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="app-button-primary"
                  onClick={() => {
                    const groups = value.groups.filter(
                      (group) => group.id !== current.id,
                    );
                    onChange({
                      groups,
                      defaultId: isDefault ? groups[0].id : value.defaultId,
                    });
                    setSelectedId(isDefault ? groups[0].id : value.defaultId);
                    setDialog(null);
                  }}
                >
                  删除方案
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <label className="block space-y-1 text-xs text-secondary">
                方案名称
                <input
                  data-initial-focus
                  className="app-input w-full"
                  value={draft}
                  maxLength={40}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="输入自定义方案名称"
                />
              </label>
              {dialog === "new" && (
                <label className="mt-3 flex items-center gap-2 text-sm text-secondary">
                  <input
                    type="checkbox"
                    checked={copyCurrent}
                    onChange={(event) => setCopyCurrent(event.target.checked)}
                  />
                  从“{current.name}”复制启动指令
                </label>
              )}
              {error && (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {error}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => setDialog(null)}
                >
                  取消
                </button>
                <button type="submit" className="app-button-primary">
                  {dialog === "new" ? "创建方案" : "保存名称"}
                </button>
              </div>
            </form>
          )}
        </AppDialog>
      )}
    </div>
  );
}
