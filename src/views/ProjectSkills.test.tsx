// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { ProjectSkills } from "./ProjectSkills";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./ProjectDetail", () => ({
  ProjectDetail: ({ projectId }: { projectId: string }) => (
    <div data-skills-content>{projectId}</div>
  ),
}));

function RouteProbe() {
  const location = useLocation();
  return <output>{location.pathname + location.search}</output>;
}

it("places the only return action in the toolbar outside skills content and retains the checkout on return", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={[
            "/project/demo/skills?worktree=%3Cworkspace%3E%2Ftopic",
          ]}
        >
          <RouteProbe />
          <Routes>
            <Route path="/project/:id/skills" element={<ProjectSkills />} />
            <Route path="/project/:id" element={<div>Workspace</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    const toolbar = host.querySelector('[role="toolbar"]')!;
    const back = toolbar.querySelector("button")!;
    const content = host.querySelector("[data-skills-content]")!;
    expect(content.textContent).toBe("demo");
    expect(toolbar.contains(content)).toBe(false);
    expect(content.parentElement?.contains(back)).toBe(false);
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(back.textContent).toBe("worktree.back");
    await act(async () => back.click());
    expect(host.querySelector("output")?.textContent).toBe(
      "/project/demo?worktree=%3Cworkspace%3E%2Ftopic",
    );
    expect(host.textContent).toContain("Workspace");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
