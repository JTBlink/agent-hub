// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "./AppContext";

vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
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
      <button onClick={() => app.setViewedSkillGroupId("")}>Library</button>
      <button onClick={() => app.setViewingUngrouped(true)}>Ungrouped</button>
      <button onClick={() => app.setViewedSkillGroupId("demo-group")}>
        Group
      </button>
      <button onClick={() => void app.refreshSkillGroups()}>Refresh</button>
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
