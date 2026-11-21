import "./runtime";
import { MemoryRouter } from "react-router-dom";
import { ExistingTasks } from "./ExistingTasks";
import { bindings, demoTasks } from "./task-demo";
// Selected prototype: task sidebar, runner table and right-hand details. Demo data only.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Box,
  CheckCircle2,
  Clock3,
  Code2,
  Layers,
  ListTodo,
  Moon,
  Search,
  Server,
  Settings,
  Sun,
  AlertCircle,
  PauseCircle,
} from "lucide-react";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import { RepositoryPlatformIcon } from "../../../src/components/RepositoryPlatformIcon";
import { TaskSelectedProjects } from "../../../src/components/tasks/TaskSelectedProjects";
import "../../../src/index.css";
import "./style.css";

import type { TaskProvider } from "../../../src/lib/taskBrowserApi";
import {
  projectHasRunner,
  projects,
  runnerKey,
  runners,
  type Runner,
} from "./demo-data";
import { RunnerDetail } from "./RunnerDetail";
import { RunnerHeader } from "./RunnerHeader";
import { Status } from "./Status";
import { TaskSidebar } from "./TaskSidebar";
export function App() {
  const [dark, setDark] = useState(
    new URLSearchParams(location.search).get("theme") !== "light",
  );
  const [tab, setTab] = useState("all");
  const [provider, setProvider] = useState<TaskProvider | "all">("all");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const selectedProjects = projects.filter(
    (p) => !projectIds.length || projectIds.includes(p.id),
  );
  const scopedProjects = selectedProjects.filter(
    (project) => provider === "all" || project.platform === provider,
  );
  const platform = selectedProjects.every((p) => p.platform === "gitlab")
    ? "gitlab"
    : selectedProjects.every((p) => p.platform === "github")
      ? "github"
      : "mixed";
  const [query, setQuery] = useState("");
  const [os, setOs] = useState("all");
  const [selected, setSelected] = useState<Runner | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [scene, setScene] = useState("normal");
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState("14:32:08");
  const initialView = new URLSearchParams(location.search).get("view");
  const [page, setPage] = useState(
    initialView === "issues"
      ? "任务"
      : initialView === "reviews"
        ? "PR/MR"
        : "Runner",
  );
  const showingRunners = page === "Runner";
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(
          "input,textarea,button,[role=combobox],[contenteditable]",
        )
      )
        return;
      if (e.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function refresh() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      setUpdated(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    }, 650);
  }
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [auto]);
  const source = runners.filter((r) =>
    scopedProjects.some((p) => projectHasRunner(p, r)),
  );
  const data = scene === "empty" ? [] : source;
  const visible = data
    .filter(
      (r) =>
        (tab === "all" || r.state === tab || (tab === "paused" && r.paused)) &&
        (os === "all" || r.os === os) &&
        `${r.name} ${r.id} ${r.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        ({ online: 0, offline: 1, unknown: 2 })[a.state] -
        { online: 0, offline: 1, unknown: 2 }[b.state],
    );
  function choose(r: Runner) {
    setSelected(r);
    setDetailOpen(true);
  }
  function changeProvider(next: TaskProvider | "all") {
    setProvider(next);
    setSelected(null);
    setDetailOpen(false);
    setTab("all");
  }

  if (initialView === "before" || initialView === "before-reviews")
    return (
      <div className="prototype original-layout">
        <ExistingTasks
          before
          kind={initialView === "before-reviews" ? "review" : "issue"}
          projectIds={projectIds}
          onProjects={setProjectIds}
          onKind={() => {}}
        />
      </div>
    );
  const projectSummary = (
    <TaskSelectedProjects
      projects={selectedProjects}
      projectIcon={(id) => (
        <RepositoryPlatformIcon
          providers={bindings
            .filter((binding) => binding.project_id === id)
            .map((binding) => binding.provider)}
          fallbackLabel="项目"
        />
      )}
    />
  );
  return (
    <div className="prototype">
      <header className="titlebar">
        <span>AgentHub</span>

        <span className="muted">
          交互原型 · 演示数据
          <button
            type="button"
            aria-label="切换明暗主题"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </span>
      </header>
      <div className="workbench">
        <nav className="rail" aria-label="工作台">
          <Box />
          <Layers />
          <button className="active" aria-label="任务">
            <ListTodo />
          </button>
          <Code2 />
          <div className="rail-bottom">
            <Settings />
          </div>
        </nav>
        <TaskSidebar
          page={page}
          projectIds={projectIds}
          onProjectChange={(id) => {
            setProjectIds(id);
            setSelected(null);
            setDetailOpen(false);
            setTab("all");
            setQuery("");
            setOs("all");
            setScene("normal");
          }}
          platform={platform}
          setPage={setPage}
          taskCount={
            demoTasks.filter(
              (t) =>
                t.kind === "issue" &&
                t.state === "open" &&
                (!projectIds.length || projectIds.includes(t.project_id)),
            ).length
          }
          reviewCount={
            demoTasks.filter(
              (t) =>
                t.kind === "review" &&
                t.state === "open" &&
                (!projectIds.length || projectIds.includes(t.project_id)),
            ).length
          }
          onlineCount={source.filter((r) => r.state === "online").length}
        />
        <main>
          {showingRunners && (
            <RunnerHeader
              projectSummary={projectSummary}
              provider={provider}
              onProvider={changeProvider}
              hosts={[
                ...new Set(scopedProjects.map((project) => project.host)),
              ]}
              includeGitHub={scopedProjects.some(
                (project) => project.platform === "github",
              )}
              refreshing={refreshing}
              onRefresh={refresh}
            />
          )}
          <div hidden={showingRunners}>
            <ExistingTasks
              kind={page === "PR/MR" ? "review" : "issue"}
              header={
                <div className="project-page-title">
                  <h1>{page === "PR/MR" ? "PR/MR" : "任务"}</h1>
                  {projectSummary}
                </div>
              }
              projectIds={projectIds}
              onProjects={setProjectIds}
              onKind={(kind) => setPage(kind === "review" ? "PR/MR" : "任务")}
            />
          </div>
          <div hidden={!showingRunners}>
            <>
              <div className="overview">
                <div>
                  <span className="metric-label">可见 Runner</span>
                  <strong>{data.length}</strong>
                </div>
                <div>
                  <span className="metric-label">
                    <span className="dot online" />
                    在线
                  </span>
                  <strong>
                    {data.filter((r) => r.state === "online").length}
                    <small>台</small>
                  </strong>
                </div>
                <div>
                  <span className="metric-label">
                    <span className="dot offline" />
                    离线
                  </span>
                  <strong>
                    {data.filter((r) => r.state === "offline").length}
                    <small>台</small>
                  </strong>
                </div>
                <div>
                  <span className="metric-label">
                    <PauseCircle size={13} />
                    已暂停
                  </span>
                  <strong>
                    {data.filter((r) => r.paused).length}
                    <small>台</small>
                  </strong>
                </div>
                <p>
                  在线与暂停分别统计
                  <br />
                  暂停的执行机仍可能在线
                </p>
              </div>
              <div className="toolbar">
                <div className="tabs">
                  {[
                    ["all", "全部"],
                    ["online", "在线"],
                    ["offline", "离线"],
                    ["unknown", "未知"],
                    ["paused", "已暂停"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={tab === key}
                      className={tab === key ? "current" : ""}
                      onClick={() => setTab(key)}
                    >
                      {label}
                      <span>
                        {
                          data.filter(
                            (r) =>
                              key === "all" ||
                              r.state === key ||
                              (key === "paused" && r.paused),
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                </div>
                <div className="filters">
                  <label className="search">
                    <Search size={15} />
                    <input
                      aria-label="搜索 Runner"
                      placeholder="搜索名称、ID、标签"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <ThemedSelect
                    aria-label="操作系统"
                    value={os}
                    onChange={(e) => setOs(e.target.value)}
                  >
                    <option value="all">全部系统</option>
                    <option>Linux</option>
                    <option>macOS</option>
                    <option>Windows</option>
                  </ThemedSelect>
                </div>
              </div>
              {!scopedProjects.length ? (
                <div className="empty">
                  <Server size={30} />
                  <h2>所选项目未连接此平台</h2>
                  <p>切换平台，或从侧栏选择该平台的项目。</p>
                  <button onClick={() => changeProvider("all")}>
                    查看全部平台
                  </button>
                </div>
              ) : scene === "error" || scene === "denied" ? (
                <div className="empty">
                  <AlertCircle size={30} />
                  <h2>
                    {scene === "denied"
                      ? "无权查看 Runner"
                      : "Runner 列表读取失败"}
                  </h2>
                  <p>
                    {scene === "denied"
                      ? "请检查当前账号的项目角色与 Runner 查询权限。"
                      : "请检查平台连接，然后重试。查询失败不代表执行机离线。"}
                  </p>
                  <button
                    onClick={() => {
                      setScene("normal");
                      refresh();
                    }}
                  >
                    重新查询
                  </button>
                </div>
              ) : (
                <div className="results">
                  <div className="listing">
                    {!visible.length ? (
                      <div className="empty">
                        <Server size={30} />
                        <h2>
                          {data.length
                            ? "没有匹配的 Runner"
                            : "当前项目没有可见的 Runner"}
                        </h2>
                        <p>
                          {data.length
                            ? "试试其他名称、标签或状态筛选。"
                            : "检查项目是否启用了共享 Runner，或是否已注册自托管 Runner。"}
                        </p>
                        {data.length > 0 && (
                          <button
                            onClick={() => {
                              setQuery("");
                              setOs("all");
                              setTab("all");
                            }}
                          >
                            清除筛选
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>执行机</th>
                              <th>连接状态</th>
                              <th>任务状态</th>
                              <th>系统 / 作用域</th>
                              <th>可用项目</th>
                              <th>标签</th>
                              <th>最后联系</th>
                              <th>
                                <span className="sr-only">操作</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((r) => (
                              <tr key={runnerKey(r)}>
                                <td>
                                  <button
                                    className="runner-name"
                                    onClick={() => choose(r)}
                                  >
                                    <RepositoryPlatformIcon
                                      providers={[r.platform]}
                                      fallbackLabel="平台"
                                    />
                                    <span>
                                      <b>{r.name}</b>
                                      <small>
                                        {r.host} · #{r.id}
                                        {r.paused && <em>已暂停</em>}
                                      </small>
                                    </span>
                                  </button>
                                </td>
                                <td>
                                  <Status runner={r} />
                                </td>
                                <td>
                                  <span
                                    className={
                                      r.work === "忙碌" ? "working" : "muted"
                                    }
                                  >
                                    {r.work === "忙碌" && (
                                      <Activity size={13} />
                                    )}{" "}
                                    {r.work}
                                  </span>
                                </td>
                                <td>
                                  {r.os}
                                  <small className="muted">{r.scope}</small>
                                </td>
                                <td className="runner-projects">
                                  {scopedProjects
                                    .filter((p) => projectHasRunner(p, r))
                                    .map((p) => (
                                      <small key={p.id}>{p.name}</small>
                                    ))}
                                </td>
                                <td>
                                  <div className="tags">
                                    {r.tags.map((t) => (
                                      <span key={t}>{t}</span>
                                    ))}
                                  </div>
                                </td>
                                <td className="muted">{r.seen}</td>
                                <td>
                                  <button
                                    className="detail-link"
                                    onClick={() => choose(r)}
                                  >
                                    详情
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="list-foot">
                      <span>
                        显示 {visible.length} / {data.length} 台
                      </span>
                      <span>
                        <CheckCircle2 size={13} />
                        显示所选项目可用的 Runner，共享执行机去重统计
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="bottom-note runner-bottom-note">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={13} />
                  {updated} 更新
                </span>
                <label className="auto">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                  />
                  每 30 秒刷新
                </label>
              </div>
            </>
          </div>
        </main>
      </div>
      <footer className="statusbar">
        <span>任务 / {page}</span>
        <span>原型 · 演示数据，无远端操作</span>
        <div className="scenario">
          <label htmlFor="scene">演示场景</label>
          <select
            id="scene"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
          >
            <option value="normal">正常列表</option>
            <option value="empty">无执行机</option>
            <option value="error">查询失败</option>
            <option value="denied">权限不足</option>
          </select>
        </div>
      </footer>
      {detailOpen && (
        <div className="drawer-wrap">
          <button
            className="scrim"
            aria-label="关闭详情面板"
            onClick={() => setDetailOpen(false)}
          />
          {selected && (
            <RunnerDetail
              r={selected}
              projectName={scopedProjects
                .filter((p) => projectHasRunner(p, selected))
                .map((p) => p.repository)
                .join("、")}
              onClose={() => setDetailOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <App />
  </MemoryRouter>,
);
