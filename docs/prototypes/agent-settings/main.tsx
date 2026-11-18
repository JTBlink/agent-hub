import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { CalendarClock, Settings2, TerminalSquare } from "lucide-react";
import { SettingsTabs } from "../../../src/components/settings/SettingsTabs";
import { useNavigate } from "react-router-dom";
import { LaunchBackupPrototype } from "./LaunchBackupPrototype";
import { AgentsPrototype } from "./AgentsPrototype";
import { AutomationPrototype } from "./AutomationPrototype";
import { TerminalPrototype } from "./TerminalPrototype";
import { useLaunchSettingsPrototype } from "./useLaunchSettingsPrototype";
import "../../../src/index.css";
import "./agents-prototype.css";

document.documentElement.classList.toggle(
  "dark",
  new URLSearchParams(location.search).get("theme") !== "light",
);
Object.assign(window, { __TAURI_INTERNALS__: { invoke: async () => null } });
const { default: i18n, i18nReady } = await import("../../../src/i18n");
await i18nReady;
await i18n.changeLanguage("zh");
const placeholder = (
  <p className="p-4 text-sm text-muted">本次仅预览 Agent 启动方案设置。</p>
);
type View = "settings" | "automation" | "terminal";

export function Host() {
  const settings = useLaunchSettingsPrototype();
  const routerNavigate = useNavigate();
  const initial = new URLSearchParams(location.search).get("view");
  const [view, setView] = useState<View>(
    initial === "automation" || initial === "terminal" ? initial : "settings",
  );
  const navigate = (next: View) => {
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    history.replaceState(null, "", url);
  };
  const openSettings = () => {
    routerNavigate({ hash: "#agents" });
    navigate("settings");
  };
  const openBackup = () => {
    routerNavigate({ hash: "#backup" });
    navigate("settings");
  };
  return (
    <div className="prototype-host flex h-screen flex-col overflow-hidden bg-background text-primary">
      <nav
        aria-label="原型场景"
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-subtle bg-bg-secondary px-3 py-1.5"
      >
        <span className="mr-3 text-xs text-muted">启动方案 · 原型</span>
        {[
          { id: "settings", label: "Agent 设置", icon: Settings2 },
          { id: "automation", label: "自动化任务", icon: CalendarClock },
          { id: "terminal", label: "终端新建菜单", icon: TerminalSquare },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent ${view === item.id ? "bg-surface-active text-accent" : "text-muted hover:bg-surface-hover"}`}
            onClick={() =>
              item.id === "settings"
                ? openSettings()
                : navigate(item.id as View)
            }
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </nav>
      <main className="flex min-h-0 flex-1 flex-col p-3">
        <div
          className={
            view === "settings" ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <header className="workbench-document-header mb-3 shrink-0">
            <h1 className="app-page-title flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-accent" />
              设置
            </h1>
            <p className="app-page-subtitle">
              管理 Agent、技能、外观及应用偏好
            </p>
          </header>
          <SettingsTabs
            agentCount={
              settings.agents.filter((agent) => agent.installed).length
            }
          >
            {{
              agents: (
                <AgentsPrototype settings={settings} onBackup={openBackup} />
              ),
              skills: placeholder,
              appearance: placeholder,
              backup: <LaunchBackupPrototype settings={settings} />,
              network: placeholder,
              hosts: placeholder,
              permissions: placeholder,
              about: placeholder,
              logs: placeholder,
            }}
          </SettingsTabs>
        </div>
        <div
          className={
            view === "automation" ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <AutomationPrototype settings={settings} onSettings={openSettings} />
        </div>
        <div
          className={
            view === "terminal" ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <TerminalPrototype settings={settings} onSettings={openSettings} />
        </div>
      </main>
      <footer className="flex h-6 shrink-0 items-center border-t border-border-subtle bg-bg-secondary px-3 text-xs text-muted">
        Agent 启动方案 · 动态共享
        <span className="ml-auto">演示数据 · 不修改真实配置</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/settings#agents"]}>
    <Host />
  </MemoryRouter>,
);
