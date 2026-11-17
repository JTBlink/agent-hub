import { ChevronRight, FileCode2, TriangleAlert } from "lucide-react";
import { cn } from "../../../src/utils";
import {
  AGENTS,
  ROLES,
  type AgentKey,
  type EntryState,
  type Role,
  roleState,
} from "./subagentsData";
const STATE_LABEL: Record<EntryState, string> = {
  ok: "正常",
  stale: "副本待刷新",
  edited: "外部修改",
};

export function StateChip({ state }: { state: EntryState }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        state === "ok"
          ? "bg-success/10 text-success"
          : "bg-warning/10 text-warning",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          state === "ok" ? "bg-success" : "bg-warning",
        )}
      />
      {STATE_LABEL[state]}
    </span>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

export function RoleCard({ role, onOpen }: { role: Role; onOpen: () => void }) {
  const state = roleState(role);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "app-panel flex flex-col gap-2 p-3 text-left transition-colors outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent",
        state !== "ok" && "border-warning/40",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-bg text-xs font-semibold text-accent-dark uppercase">
          {role.id.slice(0, 3)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-primary">
            {role.id}
          </h3>
          <p className="line-clamp-2 text-xs leading-5 text-muted">
            {role.description}
          </p>
        </div>
        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-faint" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {role.agents.map((key) => (
          <span
            key={key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
              AGENTS[key].installed
                ? "border-border-subtle text-secondary"
                : "border-border-faint text-faint",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                AGENTS[key].installed ? "bg-success" : "bg-muted",
              )}
            />
            {AGENTS[key].name}
          </span>
        ))}
        {state !== "ok" && <StateChip state={state} />}
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-border-faint pt-2 text-xs text-faint">
        <span className="min-w-0 truncate">{role.source}</span>
        <span className="ml-auto shrink-0">{role.entries.length} 处入口</span>
      </div>
    </button>
  );
}

export function RoleTable({
  roles,
  onOpen,
  project,
}: {
  roles: Role[];
  onOpen: (id: string) => void;
  project?: boolean;
}) {
  const columns: AgentKey[] = project
    ? ["claude_code", "codex"]
    : ["claude_code", "codex"];
  return (
    <div className="app-panel overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bg-secondary text-xs text-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">角色</th>
            <th className="px-3 py-2 text-left font-medium">职责</th>
            {columns.map((key) => (
              <th key={key} className="px-3 py-2 text-left font-medium">
                {AGENTS[key].name}
              </th>
            ))}
            <th className="px-3 py-2 text-left font-medium">
              {project ? "中央内容" : "入口"}
            </th>
            <th className="px-3 py-2 text-left font-medium">更新</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr
              key={role.id}
              onClick={() => onOpen(role.id)}
              className="cursor-pointer border-t border-border-faint hover:bg-surface-hover"
            >
              <td className="px-3 py-2">
                <b className="block font-semibold text-primary">{role.id}</b>
                <code className="text-xs text-muted">{role.contract}</code>
              </td>
              <td className="max-w-[320px] px-3 py-2 text-xs text-muted">
                {role.description}
              </td>
              {columns.map((key) => {
                const entries = role.entries.filter((e) => e.agent === key);
                if (entries.length === 0)
                  return (
                    <td key={key} className="px-3 py-2">
                      <span className="text-xs text-faint">未部署</span>
                    </td>
                  );
                const worst = entries.some((e) => e.state === "edited")
                  ? "edited"
                  : entries.some((e) => e.state === "stale")
                    ? "stale"
                    : "ok";
                return (
                  <td key={key} className="px-3 py-2">
                    <StateChip state={worst} />
                  </td>
                );
              })}
              <td className="px-3 py-2 text-xs text-secondary">
                {project ? (
                  <code className="text-muted">
                    .agents/subagents/{role.id}/
                  </code>
                ) : (
                  `${role.entries.length} 处`
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted">{role.updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectBanner({
  role,
  onOpen,
}: {
  role: Role;
  onOpen: (dialog: "conflict") => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 text-secondary">
        <b className="mb-0.5 block text-primary">
          1 处入口被外部修改，提交前需要确认
        </b>
        <code className="font-mono">.claude/agents/{role.id}.md</code>
        <span className="text-muted"> 的内容与仓库内契约渲染结果不一致。</span>
      </div>
      <button
        type="button"
        onClick={() => onOpen("conflict")}
        className="app-button-secondary ml-auto shrink-0"
      >
        处理…
      </button>
    </div>
  );
}

export function CommitPanel() {
  const files = ROLES.flatMap((role) => [
    `.agents/subagents/${role.id}/${role.contract}`,
    `.agents/subagents/${role.id}/native/claude.md`,
    `.agents/subagents/${role.id}/native/codex.toml`,
  ]);
  return (
    <div className="app-panel">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <FileCode2 className="h-3.5 w-3.5 text-muted" />
        <b className="text-xs font-medium text-primary">需提交文件</b>
        <span className="text-xs text-muted">
          内容与入口一起提交，成员才能直接使用
        </span>
      </div>
      <ul className="px-4 py-3 font-mono text-xs leading-6 text-muted">
        {files.map((file) => (
          <li key={file}>{file}</li>
        ))}
        <li>.agents/subagents/roles.md</li>
        <li>.claude/agents/*.md（软链接）</li>
        <li>.codex/agents/*.toml（软链接）</li>
        <li>.agent-hub/project-subagents.json（可选共享的管理清单）</li>
      </ul>
    </div>
  );
}
