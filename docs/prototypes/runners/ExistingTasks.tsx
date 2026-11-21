// Production task components with synthetic data; no production code is modified.
import { useState, type ReactNode } from "react";
import { TaskToolbar } from "../../../src/components/tasks/TaskToolbar";
import { TaskListTable } from "../../../src/components/tasks/TaskListTable";
import { TaskDetails } from "../../../src/components/tasks/TaskDetails";
import { TaskConnections } from "../../../src/components/tasks/TaskConnections";
import type {
  RepositoryTask,
  TaskFilters,
  TaskProvider,
} from "../../../src/lib/tauri";
import { demoTasks, taskProjects, bindings } from "./task-demo";
import { taskSearchFilters } from "../../../src/lib/taskSearch";

export function ExistingTasks({
  kind,
  projectIds,
  onProjects,
  onKind,
  header,
  before = false,
}: {
  kind: "issue" | "review";
  projectIds: string[];
  onProjects: (ids: string[]) => void;
  onKind: (kind: "issue" | "review") => void;
  header?: ReactNode;
  before?: boolean;
}) {
  const [provider, setProvider] = useState<TaskProvider | "all">("all");
  const [settings, setSettings] = useState<TaskFilters>({
    kind,
    state: "open",
    text: "",
    personal: "all",
  });
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<RepositoryTask | null>(null);
  const [connections, setConnections] = useState(false);
  const [notice, setNotice] = useState("");
  const filters = taskSearchFilters({ ...settings, kind, text: search });
  const scoped = demoTasks.filter(
    (t) =>
      t.kind === kind &&
      (!projectIds.length || projectIds.includes(t.project_id)) &&
      (provider === "all" || t.provider === provider),
  );
  const items = scoped.filter(
    (t) =>
      (filters.state === "all" || t.state === filters.state) &&
      (!filters.text ||
        t.title.toLowerCase().includes(filters.text.toLowerCase())) &&
      (!filters.author ||
        t.metadata?.author ===
          (filters.author === "@me" ? "demo" : filters.author)) &&
      (!filters.assignee ||
        t.assignees.includes(
          filters.assignee === "@me" ? "demo" : filters.assignee,
        )) &&
      (filters.labels || []).every((label) =>
        t.metadata?.labels.includes(label),
      ),
  );
  return (
    <section className={`existing-task-page ${before ? "before" : "after"}`}>
      <TaskToolbar
        provider={provider}
        projectIds={projectIds}
        projects={taskProjects}
        bindings={bindings}
        identities={["gitlab.example.invalid · demo", "github.com · demo"]}
        filters={filters}
        items={scoped}
        search={search}
        loading={false}
        connections={connections}
        accountRefresh={0}
        leading={header}
        onProvider={setProvider}
        onProjects={onProjects}
        onFilters={(patch) => {
          if (patch.kind) onKind(patch.kind);
          setSettings((v) => ({ ...v, ...patch }));
          if (patch.text !== undefined) setSearch(patch.text);
        }}
        onSearch={setSearch}
        onRefresh={() => setNotice("演示列表已刷新")}
        onConnections={() => setConnections(!connections)}
        onAccounts={() => setNotice("保留原账号入口；原型不切换真实账号。")}
        onOpenRepository={() => setNotice("保留原仓库入口；原型不访问远端。")}
      />
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button className="detail-link" onClick={() => setNotice("")}>
            关闭
          </button>
        </div>
      )}
      {connections && (
        <TaskConnections
          projects={taskProjects}
          bindings={bindings}
          onChanged={async () => setNotice("原型只使用演示绑定")}
          onClose={() => setConnections(false)}
        />
      )}
      <div className="existing-list">
        <TaskListTable
          items={items}
          projects={taskProjects}
          selectedKey={selection?.key}
          onOpen={(t) => setSelection(t)}
          onOpenRepository={() => setNotice("保留原仓库跳转入口")}
          onUpdated={() => setNotice("演示更新，不写入远端")}
          onStart={() =>
            setNotice("保留现有 Agent 启动入口；原型不启动真实任务。")
          }
          empty={
            <tr>
              <td colSpan={6}>没有符合筛选条件的任务</td>
            </tr>
          }
        />
      </div>
      <div className="bottom-note">显示 {items.length} 项</div>
      {selection && (
        <div className="existing-detail">
          <TaskDetails
            task={selection}
            full={false}
            onClose={() => setSelection(null)}
            onExpand={() => setNotice("保留现有详情展开入口")}
            onUpdated={() => setNotice("演示更新")}
            onStart={() => setNotice("保留现有 Agent 启动入口")}
          />
        </div>
      )}
    </section>
  );
}
