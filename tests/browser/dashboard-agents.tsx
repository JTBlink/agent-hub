/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import "../../src/index.css";

const errors: string[] = [];
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) =>
  errors.push(String(event.reason)),
);
const tools = [
  { key: "codex", installed: true, enabled: true },
  { key: "claude_code", installed: true, enabled: false },
  { key: "hermes", installed: false, enabled: true },
].map((tool) => ({
  ...tool,
  display_name: tool.key,
  skills_dir: "<workspace>/skills",
  is_custom: false,
  has_path_override: false,
  project_relative_skills_dir: null,
  category: "coding",
}));
Object.assign(window, {
  dashboardAgentHarness: { errors },
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    unregisterCallback: () => {},
    invoke: async (command: string, args: { key?: string }) => {
      if (command === "get_settings") {
        if (args?.key === "language") return "zh";
        if (args?.key === "agent_control_setup_prompt") return "dismissed";
        return null;
      }
      if (command === "get_tool_status") return tools;
      if (
        [
          "get_presets",
          "get_managed_skills",
          "get_projects",
          "get_central_repo_warnings",
        ].includes(command)
      )
        return [];
      if (command === "get_central_repo_path") return "<workspace>/skills";
      if (command === "check_app_update") return { has_update: false };
      return null;
    },
  },
});
const { i18nReady } = await import("../../src/i18n/index");
await i18nReady;
const { AppProvider } = await import("../../src/context/AppContext");
const { ThemeProvider } = await import("../../src/context/ThemeContext");
const { Dashboard } = await import("../../src/views/Dashboard");
const { Settings } = await import("../../src/views/Settings");
function LocationMarker() {
  const location = useLocation();
  return (
    <output id="route-marker" hidden>
      {location.pathname + location.hash}
    </output>
  );
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <ThemeProvider>
      <AppProvider>
        <LocationMarker />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AppProvider>
    </ThemeProvider>
  </MemoryRouter>,
);
