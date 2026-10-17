// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import { Settings } from "./Settings";

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  getCentralRepoPath: vi.fn(),
  getCentralRepoPathOverride: vi.fn(),
  getCentralRepoPendingPath: vi.fn(),
  checkLastPanic: vi.fn(),
  getCentralRepoWarnings: vi.fn(),
  getSkillsDirectory: vi.fn(),
  getBackupDirectory: vi.fn(),
}));
vi.mock("../lib/tauri", () => api);
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.1.6" }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({ tools: [], refreshTools: vi.fn() }),
}));
vi.mock("../context/ThemeContext", () => ({
  useThemeContext: () => ({ theme: "dark", setTheme: vi.fn() }),
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.getSettings.mockResolvedValue(null);
  api.getCentralRepoPath.mockResolvedValue("~/.agent-hub");
  api.getCentralRepoPathOverride.mockResolvedValue(null);
  api.getCentralRepoPendingPath.mockResolvedValue(null);
  api.checkLastPanic.mockResolvedValue(null);
  api.getCentralRepoWarnings.mockResolvedValue(["nested"]);
  api.getSkillsDirectory.mockResolvedValue("~/.agent-hub/skills");
  api.getBackupDirectory.mockResolvedValue("~/.agent-hub/backup");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const tabs = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
];
const visiblePanel = () =>
  container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;

it("groups existing settings and retains an unsaved proxy across tabs and locale changes", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "zh",
    resources: { zh: { translation: zh }, en: { translation: en } },
  });
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/settings"]}>
          <Settings />
        </MemoryRouter>
      </I18nextProvider>,
    ),
  );
  expect(visiblePanel().textContent).toContain("支持的 Agent");
  await act(async () => tabs()[1].click());
  expect(visiblePanel().textContent).toContain("默认部署方式");
  expect(visiblePanel().textContent).toContain("Skill 自动更新");
  expect(visiblePanel().textContent).not.toContain("本地同步仓库");
  await act(async () => tabs()[3].click());
  expect(visiblePanel().textContent).toContain("本地同步仓库");
  expect(visiblePanel().querySelector("details")?.open).toBe(false);
  const proxy = visiblePanel().querySelector<HTMLInputElement>(
    'input[placeholder*="7890"]',
  )!;
  expect(proxy).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(proxy, "http://127.0.0.1:8080");
    proxy.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => tabs()[4].click());
  expect(visiblePanel().textContent).toContain("检查更新");
  expect(visiblePanel().textContent).toContain("应用数据目录");
  await act(async () => i18n.changeLanguage("en"));
  await act(async () => tabs()[3].click());
  expect(proxy.value).toBe("http://127.0.0.1:8080");
  const alert = [...container.querySelectorAll("p")].find(
    (p) => p.textContent === "settings.repoWarning_nested",
  );
  expect(alert).toBeDefined();
  expect(alert?.closest('[role="tabpanel"]')).toBeNull();
});
