import { MoreHorizontal, Settings, X } from "lucide-react";
import { CardActionMenu } from "../../../src/components/CardActionMenu";
import { HerdrIcon } from "../../../src/features/herdr/components/HerdrIcon";
import { HerdrSettingsPanel } from "../../../src/features/herdr/components/HerdrSettingsPanel";
import type { LaunchSettingsPrototype } from "./useLaunchSettingsPrototype";
import { taskLaunchGroup, type TaskLaunchChoice } from "./launchGroups";

export function HerdrSidebarPrototype({
  panel,
  onPanel,
  followProject,
  onFollow,
  active,
  settings,
  onSettings,
}: {
  panel: "workspace" | "settings";
  onPanel: (panel: "workspace" | "settings" | null) => void;
  followProject: boolean;
  onFollow: (value: boolean) => void;
  active?: TaskLaunchChoice;
  settings: LaunchSettingsPrototype;
  onSettings: () => void;
}) {
  const group = active ? taskLaunchGroup(settings, active) : undefined;
  const agent = settings.agents.find((item) => item.key === active?.agentKey);
  return (
    <aside
      aria-label="Herdr 侧栏"
      className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-bg-secondary"
    >
      {panel === "settings" ? (
        <HerdrSettingsPanel
          onBack={() => onPanel("workspace")}
          follow={{
            enabled: followProject,
            ready: true,
            saving: false,
            error: false,
            change: async (value) => onFollow(value),
          }}
        />
      ) : (
        <>
          <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
            <HerdrIcon className="h-4 w-4" />
            <h2 className="flex-1 text-xs font-semibold text-secondary">
              Herdr
            </h2>
            <CardActionMenu
              label="Herdr 更多"
              triggerIcon={<MoreHorizontal size={15} />}
              actions={[
                {
                  key: "settings",
                  label: "设置",
                  icon: <Settings size={15} />,
                  onSelect: () => onPanel("settings"),
                },
              ]}
            />
            <button
              type="button"
              aria-label="关闭 Herdr 侧栏"
              className="app-button-ghost p-1"
              onClick={() => onPanel(null)}
            >
              <X size={14} />
            </button>
          </header>
          <div className="space-y-4 p-3 text-xs">
            <div className="flex items-center justify-between text-muted">
              <span>会话</span>
              <span className="text-secondary">default</span>
            </div>
            <div className="rounded border border-border-subtle bg-surface p-3">
              <p className="font-medium text-primary">demo</p>
              <p className="mt-1 font-mono text-muted">~/projects/demo</p>
              {active ? (
                <div className="mt-4 space-y-2 border-t border-border-faint pt-3">
                  <p className="text-secondary">{agent?.display_name}</p>
                  <p className="text-accent">
                    {group?.name ?? "方案不可用"} · 启动预览
                  </p>
                  <code className="block break-all leading-5 text-muted">
                    {group?.command ?? "请重新选择方案"}
                  </code>
                </div>
              ) : (
                <p className="mt-3 leading-5 text-muted">
                  从终端“＋”菜单右侧的 Herdr 图标选择 Agent。
                </p>
              )}
            </div>
            <p className="leading-5 text-muted">
              {followProject
                ? "已开启跟随项目切换。"
                : "当前关闭跟随项目切换。"}
            </p>
            <button
              type="button"
              className="text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={onSettings}
            >
              管理 Agent 启动方案
            </button>
            <p className="leading-5 text-muted">
              关闭外层标签仅断开客户端，后台会话由 Herdr 管理。
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
