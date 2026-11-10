import { expect, it } from "vitest";
import { makeProject } from "../../tests/fixtures/workspace";
import { recentProjects } from "./recentProjects";

it("orders reopened workspaces first, limits history to 15 and excludes evicted entries", () => {
  const projects = Array.from({ length: 18 }, (_, index) => ({
    ...makeProject(),
    id: `project-${index}`,
    visited_at: index + 1,
    sort_order: 18 - index,
  }));
  projects[0].visited_at = 100;
  projects[17].visited_at = 0;
  const recent = recentProjects(projects);
  expect(recent).toHaveLength(15);
  expect(recent.map((p) => p.id)).toEqual([
    "project-0",
    ...Array.from({ length: 14 }, (_, i) => `project-${16 - i}`),
  ]);
  expect(projects[0].id).toBe("project-0");
  const current = recentProjects(projects, "project-17");
  expect(current).toHaveLength(15);
  expect(current.at(-1)?.id).toBe("project-17");
});
