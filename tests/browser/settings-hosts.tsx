import { useState } from "react";
import { SidebarVisibilityContext } from "../../src/hooks/sidebarVisibility";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SettingsTabs } from "../../src/components/settings/SettingsTabs";
import { HostsSettings } from "../../src/components/settings/HostsSettings";
import type { HostsProfile } from "../../src/lib/hostsApi";
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
let profiles: HostsProfile[] = [
  {
    id: "development",
    name: "Development",
    content: "127.0.0.2 app.test\n",
    revision: "profile-first",
    path: "/workspace/user-config/hosts/12345678-1234-4234-8234-123456789abc.hosts",
  },
];
const saveSystem = (next: string, appliedProfileId: string | null = null) => {
  content = next;
  revision += "-saved";
  return {
    snapshot: {
      path: "/etc/hosts",
      content,
      revision,
      applied_profile_id: appliedProfileId,
    },
    backup_path: null,
  };
};

Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: Record<string, string>) => {
      if (command === "list_hosts_profiles") return profiles;
      if (command === "create_hosts_profile") {
        const id = crypto.randomUUID();
        const profile = {
          id,
          name: args.name,
          content: args.content,
          revision: id,
          path: `/workspace/user-config/hosts/${id}.hosts`,
        };
        profiles = [...profiles, profile];
        return profile;
      }
      if (
        command === "update_hosts_profile" ||
        command === "delete_hosts_profile" ||
        command === "apply_hosts_profile"
      ) {
        const profile = profiles.find((p) => p.id === args.id);
        if (
          !profile ||
          profile.revision !==
            (command === "apply_hosts_profile"
              ? args.profileRevision
              : args.revision)
        )
          throw { kind: "io", message: "HOSTS_PROFILE_CONFLICT" };
        if (command === "delete_hosts_profile") {
          profiles = profiles.filter((p) => p.id !== profile.id);
          return;
        }
        if (command === "apply_hosts_profile") {
          if (args.systemRevision !== revision)
            throw { kind: "io", message: "HOSTS_CONFLICT" };
          return saveSystem(profile.content, profile.id);
        }
        const next = {
          ...profile,
          name: args.name,
          content: args.content,
          revision: profile.revision + "-saved",
        };
        profiles = profiles.map((p) => (p.id === next.id ? next : p));
        return next;
      }
      if (command === "plugin:path|dirname") {
        return args.path.slice(0, Math.max(args.path.lastIndexOf("/"), 1));
      }
      if (command === "plugin:opener|open_url") {
        document.documentElement.dataset.vscodeOpened = args.url;
        return;
      }
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
      <div
        style={{ height: "calc(100vh / var(--app-scale, 1))" }}
        className="flex min-w-0 bg-background"
      >
        <div ref={setSidebarContainer} className="flex min-h-0 shrink-0" />
        <main className="workbench-editor-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
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
