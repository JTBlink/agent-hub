import { useState } from "react";
import { SidebarVisibilityContext } from "../../src/hooks/sidebarVisibility";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SettingsTabs } from "../../src/components/settings/SettingsTabs";
import { HostsSettings } from "../../src/components/settings/HostsSettings";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";

// Synthetic IPC only: this fixture never reads or writes the system hosts file.
const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
applyTextSize(params.get("text-size") ?? "default");
let content =
  "# Local development\n127.0.0.1 localhost demo.test\n::1 localhost\n";
let revision = "first";
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: Record<string, string>) => {
      if (command === "read_system_hosts")
        return { path: "/etc/hosts", content, revision };
      if (command === "save_system_hosts") {
        if (args.revision !== revision)
          throw { kind: "io", message: "HOSTS_CONFLICT" };
        content = args.content;
        revision += "-saved";
        return {
          snapshot: { path: "/etc/hosts", content, revision },
          backup_path: "/etc/hosts.agent-hub-example.bak",
        };
      }
      if (command === "open_hosts_permission_settings") {
        document.documentElement.dataset.permissionSettingsOpened = "true";
        return null;
      }
      if (command === "get_settings") return null;
      return null;
    },
  },
});

const { default: i18n, i18nReady } = await import("../../src/i18n");
await i18nReady;

export function Fixture() {
  const { hash } = useLocation();
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
      <div className="flex h-[calc(100vh/var(--app-scale,1))] min-w-0 bg-background">
        <div ref={setSidebarContainer} className="flex min-h-0 shrink-0" />
        <main className="workbench-editor-panel flex min-w-0 flex-1 flex-col p-3">
          <h1 className="app-page-title mb-3">{i18n.t("settings.title")}</h1>
          <SettingsTabs agentCount={3}>
            {{
              agents: <p>Agents</p>,
              skills: <p>Skills</p>,
              appearance: <p>Appearance</p>,
              backup: <p>Backup</p>,
              network: <p>Network</p>,
              hosts: <HostsSettings active={hash === "#hosts"} />,
              about: <p>About</p>,
            }}
          </SettingsTabs>
        </main>
      </div>
    </SidebarVisibilityContext.Provider>
  );
}
void i18n.changeLanguage(params.get("language") ?? "zh").then(() => {
  createRoot(document.getElementById("root")!).render(
    <MemoryRouter initialEntries={["/settings#hosts"]}>
      <Fixture />
    </MemoryRouter>,
  );
});
