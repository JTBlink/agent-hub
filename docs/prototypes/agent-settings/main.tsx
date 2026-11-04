// Throwaway host: use real settings navigation with synthetic Agent defaults.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { SettingsTabs } from "../../../src/components/settings/SettingsTabs";
import { SidebarVisibilityContext } from "../../../src/hooks/sidebarVisibility";
import { AgentsPrototype } from "./AgentsPrototype";
import "../../../src/index.css";
document.documentElement.classList.toggle(
  "dark",
  new URLSearchParams(location.search).get("theme") !== "light",
);
Object.assign(window, { __TAURI_INTERNALS__: { invoke: async () => null } });
const { default: i18n, i18nReady } = await import("../../../src/i18n");
await i18nReady;
await i18n.changeLanguage("zh");
export function Host() {
  const [sidebarContainer, setSidebarContainer] =
    useState<HTMLDivElement | null>(null);
  const tabs = {
    agents: <AgentsPrototype />,
    skills: "技能",
    appearance: "外观",
    backup: "备份",
    network: "网络",
    hosts: "Hosts",
    permissions: "权限",
    about: "关于",
  };
  return (
    <SidebarVisibilityContext.Provider
      value={{
        sidebarContainer,
        resourcePanelVisible: false,
        setResourcePanelVisible: () => {},
      }}
    >
      <div className="ap-host">
        <div ref={setSidebarContainer} className="flex shrink-0" />
        <main className="ap-host-main">
          <header className="ap-app-heading">
            <Settings2 size={17} className="text-accent mt-0.5" />
            设置
          </header>
          <SettingsTabs agentCount={4}>{tabs}</SettingsTabs>
        </main>
      </div>
    </SidebarVisibilityContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/settings#agents"]}>
    <Host />
  </MemoryRouter>,
);
