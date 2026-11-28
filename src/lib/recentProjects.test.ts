import { expect, it } from "vitest";
import { makeProject } from "../../tests/fixtures/workspace";
import { recentProjects } from "./recentProjects";

it("orders reopened workspaces first, limits history to 50 and excludes evicted entries", () => {
  const projects = Array.from({ length: 53 }, (_, index) => ({
    ...makeProject(),
    id: `project-${index}`,
    visited_at: index + 1,
    sort_order: 53 - index,
  }));
  projects[0].visited_at = 100;
  projects[52].visited_at = 0;
  const recent = recentProjects(projects);
  expect(recent).toHaveLength(50);
  expect(recent.map((p) => p.id)).toEqual([
    "project-0",
    ...Array.from({ length: 49 }, (_, i) => `project-${51 - i}`),
  ]);
  expect(projects[0].id).toBe("project-0");
  const current = recentProjects(projects, "project-52");
  expect(current).toHaveLength(50);
  expect(current.at(-1)?.id).toBe("project-52");
});
