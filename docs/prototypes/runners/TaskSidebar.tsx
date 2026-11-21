import { ResizableSidebar } from "../../../src/components/ResizableSidebar";
import { RepositoryPlatformIcon } from "../../../src/components/RepositoryPlatformIcon";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import { projects } from "./demo-data";
import {
  Settings,
  CircleDot,
  GitPullRequest,
  Server,
  Activity,
  Layers,
} from "lucide-react";
export function TaskSidebar({
  page,
  setPage,
  onlineCount,
  taskCount,
  reviewCount,
  projectIds,
  onProjectChange,
  platform,
}: {
  page: string;
  setPage: (page: string) => void;
  onlineCount: number;
  taskCount: number;
  reviewCount: number;
  projectIds: string[];
  onProjectChange: (ids: string[]) => void;
  platform: string;
}) {
  return (
    <ResizableSidebar
      storageKey="prototype:runners:sidebar-width"
      label="任务"
      className="task-sidebar"
      defaultWidth={240}
      minWidth={180}
      maxWidth={400}
    >
      <div className="side-heading">
        任务{" "}
        <button aria-label="任务设置" onClick={() => setPage("代码平台连接")}>
          <Settings size={15} />
        </button>
      </div>
      <div className="sidebar-project">
        <ThemedSelect
          aria-label="当前项目"
          multiple
          leadingIcon={
            <RepositoryPlatformIcon providers={[]} fallbackLabel="项目" />
          }
          optionIcon={(id) =>
            id === "all" ? (
              <Layers size={14} />
            ) : (
              <RepositoryPlatformIcon
                providers={[
                  projects.find((p) => p.id === id)?.platform === "github"
                    ? "github"
                    : "gitlab",
                ]}
                fallbackLabel="项目"
              />
            )
          }
          valueBadge={
            projectIds.length > 1 ? (
              <span
                className="project-count"
                aria-label={`已选 ${projectIds.length} 个项目`}
              >
                {projectIds.length}
              </span>
            ) : undefined
          }
          value={projectIds.length ? projectIds : ["all"]}
          onChange={(values) =>
            onProjectChange(
              projectIds.length && values.includes("all")
                ? []
                : values.filter((value) => value !== "all"),
            )
          }
        >
          <option value="all">全部项目</option>
          {projects.map((p) => (
            <option
              key={p.id}
              value={p.id}
              disabled={projectIds.length === 1 && projectIds[0] === p.id}
            >
              {p.name}
            </option>
          ))}
        </ThemedSelect>
      </div>
      <button
        className={`side-item ${page === "任务" ? "chosen" : ""}`}
        onClick={() => setPage("任务")}
      >
        <CircleDot size={16} />
        任务 <span>{taskCount}</span>
      </button>
      <button
        className={`side-item ${page === "PR/MR" ? "chosen" : ""}`}
        onClick={() => setPage("PR/MR")}
      >
        <GitPullRequest size={16} />
        PR/MR <span>{reviewCount}</span>
      </button>
      <div className="side-rule" />
      <button
        className={`side-item ${page === "Runner" ? "chosen" : ""}`}
        onClick={() => setPage("Runner")}
      >
        <Server size={16} />
        Runner <span className="online side-count">{onlineCount}</span>
      </button>
      <button
        className={`side-item connection ${page === "代码平台连接" ? "chosen" : ""}`}
        onClick={() => setPage("代码平台连接")}
      >
        <Activity size={16} />
        代码平台连接
      </button>
      <div className="sidebar-foot">
        <span className="dot online" />{" "}
        {platform === "mixed"
          ? "GitLab / GitHub"
          : platform === "github"
            ? "GitHub"
            : "GitLab"}{" "}
        已连接
      </div>
    </ResizableSidebar>
  );
}
