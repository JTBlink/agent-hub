// Throwaway host: use real settings navigation with synthetic Agent defaults.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { SettingsTabs } from "../../../src/components/settings/SettingsTabs";
import { SidebarVisibilityContext } from "../../../src/hooks/sidebarVisibility";
import { AgentsPrototype } from "./AgentsPrototype";
import { AgentSyncPrototypeProvider } from "./AgentSyncPrototype";
import { AgentBackupPrototype } from "./AgentSyncPanel";
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
  const [agentCount, setAgentCount] = useState(4);
  const tabs = {
    agents: <AgentsPrototype onInstalledCountChange={setAgentCount} />,
    skills: "技能",
    appearance: "外观",
    backup: <AgentBackupPrototype />,
    network: "网络",
    hosts: "Hosts",
    permissions: "权限",
    about: "关于",
  };
  return (
    <AgentSyncPrototypeProvider>
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
            <SettingsTabs agentCount={agentCount}>{tabs}</SettingsTabs>
          </main>
        </div>
      </SidebarVisibilityContext.Provider>
    </AgentSyncPrototypeProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/settings#agents"]}>
    <Host />
  </MemoryRouter>,
);
