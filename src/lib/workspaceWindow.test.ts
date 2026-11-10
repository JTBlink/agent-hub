// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { workspaceStorageKey } from "./workspaceWindow";
import {
  writeTerminalLayout,
  readTerminalLayout,
  TERMINAL_LAYOUT_KEY,
  createTerminalTab,
} from "./terminalLayout";
import {
  loadPreviewSession,
  savePreviewSession,
} from "../features/preview/shared/sessionStorage";
import { createSession, openPreview } from "../features/preview/shared/session";
const native = vi.hoisted(() => ({ label: "main" }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }));
it("keeps each window's terminals and preview tabs independent and preserves main's storage", () => {
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  localStorage.clear();
  native.label = "main";
  const tab = createTerminalTab("main-project");
  writeTerminalLayout({ tabs: [tab], activeIds: {}, lastActiveId: tab.id });
  savePreviewSession(
    openPreview(createSession(), {
      kind: "web",
      address: "https://example.com",
      title: "Main",
    }),
  );
  expect(workspaceStorageKey(TERMINAL_LAYOUT_KEY)).toBe(TERMINAL_LAYOUT_KEY);
  native.label = "workspace-task";
  expect(readTerminalLayout().tabs).toEqual([]);
  expect(loadPreviewSession().tabs).toEqual([]);
  const other = createTerminalTab("task-project");
  writeTerminalLayout({ tabs: [other], activeIds: {}, lastActiveId: other.id });
  native.label = "main";
  expect(readTerminalLayout().tabs.map((tab) => tab.projectId)).toEqual([
    "main-project",
  ]);
  expect(loadPreviewSession().tabs[0]?.title).toBe("Main");
  localStorage.clear();
  vi.unstubAllGlobals();
});
