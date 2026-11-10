// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../lib/tauri";
import { makeProject } from "../../tests/fixtures/workspace";
import { toast } from "sonner";
import { createManagedSkill } from "../../tests/fixtures/managedSkill";
import { AppProvider, useApp } from "./AppContext";

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const visitEvents = vi.hoisted(() => ({
  receive: undefined as
    undefined | ((event: { payload: Array<[string, number | null]> }) => void),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, receive: typeof visitEvents.receive) => {
    if (name === "project-visits-changed") visitEvents.receive = receive;
    return () => {
      if (name === "project-visits-changed") visitEvents.receive = undefined;
    };
  },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    if (command === "get_skill_groups")
      return [{ id: "demo-group", name: "Demo", skill_count: 0 }];
    if (
      ["get_tool_status", "get_managed_skills", "get_projects"].includes(
        command,
      )
    )
      return [];
    return null;
  },
}));

function LibraryScope() {
  const app = useApp();
  return (
    <>
      <output>
        {app.loading
          ? "loading"
          : app.viewingUngrouped
            ? "ungrouped"
            : (app.viewedSkillGroup?.id ?? "library")}
      </output>
      <output data-visits>
        {JSON.stringify(app.projects.map((p) => [p.id, p.visited_at]))}
      </output>
      <button onClick={() => app.setViewedSkillGroupId("")}>Library</button>
      <button onClick={() => app.setViewingUngrouped(true)}>Ungrouped</button>
      <button onClick={() => app.setViewedSkillGroupId("demo-group")}>
        Group
      </button>
      <button onClick={() => void app.refreshSkillGroups()}>Refresh</button>
      <button onClick={() => void app.refreshAppData()}>Refresh app</button>
      <button onClick={() => void app.refreshManagedSkills()}>
        Refresh skills
      </button>
    </>
  );
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.clearAllMocks();
});
async function render() {
  await act(async () =>
    root.render(
      <AppProvider>
        <LibraryScope />
      </AppProvider>,
    ),
  );
}
async function click(label: string) {
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === label)!
      .click(),
  );
}

it("keeps an explicit full-library selection across group refresh and restart", async () => {
  await render();
  expect(container.querySelector("output")!.textContent).toBe("demo-group");
  await click("Library");
  await click("Refresh");
  expect(container.querySelector("output")!.textContent).toBe("library");
  expect(localStorage.getItem("agent-hub.viewedSkillGroupId")).toBe("");
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(container.querySelector("output")!.textContent).toBe("library");
  await click("Group");
  expect(container.querySelector("output")!.textContent).toBe("demo-group");
});

it("leaves the ungrouped view when the full library is selected", async () => {
  await render();
  await click("Ungrouped");
  expect(container.querySelector("output")!.textContent).toBe("ungrouped");
  await click("Library");
  expect(container.querySelector("output")!.textContent).toBe("library");
});

it("loads each resource once during strict startup and keeps later refreshes available", async () => {
  const projects = vi.spyOn(api, "getProjects").mockResolvedValue([]);
  const skills = vi.spyOn(api, "getManagedSkills").mockResolvedValue([]);
  const tools = vi.spyOn(api, "getToolStatus").mockResolvedValue([]);
  await act(async () =>
    root.render(
      <StrictMode>
        <AppProvider>
          <LibraryScope />
        </AppProvider>
      </StrictMode>,
    ),
  );
  expect(projects).toHaveBeenCalledTimes(1);
  expect(skills).toHaveBeenCalledTimes(1);
  expect(tools).toHaveBeenCalledTimes(1);
  expect(container.querySelector("output")!.textContent).toBe("demo-group");
  await click("Refresh app");
  expect(projects).toHaveBeenCalledTimes(2);
  expect(skills).toHaveBeenCalledTimes(2);
  expect(tools).toHaveBeenCalledTimes(2);
  await click("Refresh skills");
  expect(projects).toHaveBeenCalledTimes(3);
  expect(skills).toHaveBeenCalledTimes(3);
});

it("runs startup updates once across app refreshes and silently holds back removals", async () => {
  vi.useFakeTimers();
  const skill = createManagedSkill({ update_status: "update_available" });
  vi.spyOn(api, "getManagedSkills").mockResolvedValue([skill]);
  vi.spyOn(api, "getSettings").mockResolvedValue("on");
  vi.spyOn(api, "checkAppUpdate").mockResolvedValue({
    has_update: false,
    current_version: "1.0.0",
    latest_version: "1.0.0",
    release_url: "https://example.invalid/releases",
  });
  const check = vi
    .spyOn(api, "checkAllSkillUpdates")
    .mockResolvedValue(undefined);
  const update = vi.spyOn(api, "batchUpdateSkills").mockResolvedValue({
    refreshed: 0,
    unchanged: 0,
    held_back: [skill.name],
    failed: [],
  });
  await render();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(update).toHaveBeenCalledOnce();
  expect(toast.warning).not.toHaveBeenCalled();
  expect(toast.info).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      id: "skill-update-available",
      action: expect.objectContaining({ onClick: expect.any(Function) }),
    }),
  );
  await click("Refresh app");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(check).toHaveBeenCalledOnce();
  expect(update).toHaveBeenCalledOnce();
  expect(toast.info).toHaveBeenCalledOnce();
});

it("synchronizes visits from other windows without rescanning existing project skills", async () => {
  const projects = vi
    .spyOn(api, "getProjects")
    .mockResolvedValue([makeProject()]);
  await render();
  await act(async () => visitEvents.receive!({ payload: [["demo", 42]] }));
  expect(container.querySelector("[data-visits]")?.textContent).toBe(
    '[["demo",42]]',
  );
  expect(projects).toHaveBeenCalledTimes(1);
  const metadata = vi
    .spyOn(api, "getProjectMetadata")
    .mockResolvedValue([makeProject(), { ...makeProject(), id: "new" }]);
  await act(async () =>
    visitEvents.receive!({
      payload: [
        ["demo", 42],
        ["new", 43],
      ],
    }),
  );
  expect(projects).toHaveBeenCalledTimes(1);
  expect(metadata).toHaveBeenCalledOnce();
  expect(container.querySelector("[data-visits]")?.textContent).toContain(
    '"new"',
  );
});

it("opens a sixteenth workspace and handles repeated history events without full skill scans", async () => {
  const initial = Array.from({ length: 15 }, (_, index) => ({
    ...makeProject(),
    id: `project-${index}`,
    visited_at: index + 1,
  }));
  const projects = vi.spyOn(api, "getProjects").mockResolvedValue(initial);
  const added = { ...makeProject(), id: "project-15", visited_at: 16 };
  const metadata = vi
    .spyOn(api, "getProjectMetadata")
    .mockResolvedValue([
      ...initial.map((p, index) => (index === 0 ? { ...p, visited_at: 0 } : p)),
      added,
    ]);
  await render();
  const payload: Array<[string, number | null]> = [
    ...initial.map((p): [string, number | null] => [
      p.id,
      p.id === "project-0" ? 0 : p.visited_at,
    ]),
    [added.id, 16],
  ];
  await act(async () => visitEvents.receive!({ payload }));
  await act(async () => visitEvents.receive!({ payload }));
  expect(projects).toHaveBeenCalledOnce();
  expect(metadata).toHaveBeenCalledOnce();
  expect(container.querySelector("[data-visits]")?.textContent).toContain(
    '["project-0",0]',
  );
  expect(container.querySelector("[data-visits]")?.textContent).toContain(
    '["project-15",16]',
  );
});
