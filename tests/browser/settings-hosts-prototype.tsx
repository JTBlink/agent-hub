// Prototype host: existing settings navigation, synthetic Hosts data only.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { SidebarVisibilityContext } from "../../src/hooks/sidebarVisibility";
import { SettingsTabs } from "../../src/components/settings/SettingsTabs";
import { HostsPrototype } from "../../src/components/settings/prototype/HostsPrototype";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";
const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
applyTextSize(params.get("text-size") ?? "default");
Object.assign(window, { __TAURI_INTERNALS__: { invoke: async () => null } });
const { default: i18n, i18nReady } = await import("../../src/i18n");
await i18nReady;
await i18n.changeLanguage("zh");
export function PrototypeHost() {
  const [sidebarContainer, setSidebarContainer] =
    useState<HTMLDivElement | null>(null);
  return (
    <SidebarVisibilityContext.Provider
      value={{
        sidebarContainer,
        resourcePanelVisible: false,
        setResourcePanelVisible: () => {},
      }}
    >
      <div className="hp-prototype-host bg-background">
        <div ref={setSidebarContainer} className="flex shrink-0" />
        <main className="workbench-editor-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 pb-20">
          <SettingsTabs agentCount={3}>
            {{
              agents: "Agents",
              skills: "Skills",
              appearance: "Appearance",
              backup: "Backup",
              network: "Network",
              hosts: <HostsPrototype />,
              permissions: "Permissions",
              about: "About",
            }}
          </SettingsTabs>
        </main>
      </div>
    </SidebarVisibilityContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/settings#hosts"]}>
    <PrototypeHost />
  </MemoryRouter>,
);
