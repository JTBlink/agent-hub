import { useState } from "react";
import { Plus, TerminalSquare, X } from "lucide-react";
import { CardActionMenu } from "../../../src/components/CardActionMenu";
import { NewMenu, type LaunchBackend } from "./TerminalNewMenuPrototype";
import { HerdrIcon } from "../../../src/features/herdr/components/HerdrIcon";
import { HerdrSidebarPrototype } from "./HerdrSidebarPrototype";
import type { LaunchSettingsPrototype } from "./useLaunchSettingsPrototype";
import { taskLaunchGroup, type TaskLaunchChoice } from "./launchGroups";

interface DemoTab {
  id: string;
  title: string;
  choice?: TaskLaunchChoice;
  backend?: LaunchBackend;
}
export function TerminalPrototype({
  settings,
  onSettings,
}: {
  settings: LaunchSettingsPrototype;
  onSettings: () => void;
}) {
  const [tabs, setTabs] = useState<DemoTab[]>([
    { id: "shell", title: "终端 1" },
  ]);
  const [activeId, setActiveId] = useState("shell");
  const [herdrPanel, setHerdrPanel] = useState<"workspace" | "settings" | null>(
    null,
  );
  const [followProject, setFollowProject] = useState(false);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const group = active.choice
    ? taskLaunchGroup(settings, active.choice)
    : undefined;
  const agent = settings.agents.find(
    (item) => item.key === active.choice?.agentKey,
  );
  const add = (
    title: string,
    choice?: TaskLaunchChoice,
    backend?: LaunchBackend,
  ) => {
    const id = crypto.randomUUID();
    setTabs((all) => [...all, { id, title, choice, backend }]);
    setActiveId(id);
  };
  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border bg-background">
      {herdrPanel && (
        <HerdrSidebarPrototype
          panel={herdrPanel}
          onPanel={setHerdrPanel}
          followProject={followProject}
          onFollow={setFollowProject}
          active={active.backend === "herdr" ? active.choice : undefined}
          settings={settings}
          onSettings={onSettings}
        />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-secondary px-2">
          <span className="text-xs text-secondary">demo</span>
          <span className="text-xs text-muted">/ main</span>
          <button
            type="button"
            className="app-button-ghost ml-auto flex items-center gap-1.5 px-2 py-1 text-xs"
            onClick={() => setHerdrPanel(herdrPanel ? null : "workspace")}
          >
            <HerdrIcon className="h-4 w-4" />
            Herdr
          </button>
        </div>
        <div className="flex min-w-0 shrink-0 items-center border-b border-border-subtle bg-bg-secondary">
          <div className="flex min-w-0 overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex shrink-0 items-center border-b-2 ${tab.id === active.id ? "border-accent bg-surface" : "border-transparent"}`}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={() => setActiveId(tab.id)}
                >
                  <TerminalSquare className="h-3.5 w-3.5" />
                  {tab.title}
                </button>
                <button
                  type="button"
                  aria-label={`关闭 ${tab.title}`}
                  disabled={tabs.length === 1}
                  className="app-button-ghost mr-1 p-1 disabled:opacity-30"
                  onClick={() => {
                    const remaining = tabs.filter((item) => item.id !== tab.id);
                    setTabs(remaining);
                    if (activeId === tab.id) setActiveId(remaining[0].id);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <CardActionMenu
            label="新建标签"
            align="start"
            className="mx-1 shrink-0 self-center"
            triggerClassName="h-7 w-7"
            triggerIcon={<Plus size={15} />}
            actions={[]}
            renderContent={(close) => (
              <NewMenu
                settings={settings}
                close={close}
                onSettings={onSettings}
                onHerdrSettings={() => setHerdrPanel("settings")}
                onBasic={(label) => add(`${label} ${tabs.length + 1}`)}
                onLaunch={(choice, backend, label) => {
                  const selected = taskLaunchGroup(settings, choice);
                  const name = settings.agents.find(
                    (item) => item.key === choice.agentKey,
                  )?.display_name;
                  add(
                    `${backend === "herdr" ? "Herdr · " : ""}${label ?? name} · ${selected?.name}`,
                    choice,
                    backend,
                  );
                  if (backend === "herdr") setHerdrPanel("workspace");
                }}
              />
            )}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5 font-mono text-sm leading-7 text-secondary">
          <p className="text-muted">
            ~/projects/demo <span className="text-accent">main</span>
          </p>
          {active.choice ? (
            <>
              <p className="break-all">
                <span className="text-success">❯</span>{" "}
                {group?.command ?? "所选方案已删除"}
              </p>
              <p className="mt-6 font-sans text-sm text-primary">
                {active.backend === "herdr"
                  ? "Herdr / default / demo · "
                  : "内嵌终端 · "}
                {agent?.display_name} · {group?.name ?? "方案不可用"}
              </p>
              <p className="mt-1 font-sans text-xs text-muted">
                启动选择预览，未执行命令。
              </p>
            </>
          ) : (
            <>
              <p>
                <span className="text-success">❯</span>{" "}
                <span className="animate-pulse">▎</span>
              </p>
              <div className="mt-10 max-w-lg space-y-3 font-sans text-sm text-muted">
                <p className="text-secondary">
                  点击标签栏“＋”，选择 Agent 与启动方案。
                </p>
                <p className="text-xs leading-6">
                  点击 Agent 选择内嵌终端方案；右侧 Herdr 图标打开 Herdr
                  启动方案。两处使用相同的 Agent 配置。
                </p>
                <button
                  type="button"
                  className="text-xs text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={onSettings}
                >
                  管理 Agent 启动方案
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
