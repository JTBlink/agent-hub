// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ManagedSkill } from "../lib/tauri";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import { useSkillLibraryFilters } from "./useSkillLibraryFilters";

const allTags = ["dev", "docs"];
const order: string[] = [];
let filters: ReturnType<typeof useSkillLibraryFilters>;
let root: Root;
let container: HTMLDivElement;

function Harness({
  skills,
  groupId,
  viewingUngrouped,
}: {
  skills: ManagedSkill[];
  groupId?: string;
  viewingUngrouped: boolean;
}) {
  const currentFilters = useSkillLibraryFilters(
    skills,
    allTags,
    groupId,
    viewingUngrouped,
    order,
  );
  useEffect(() => {
    filters = currentFilters;
  }, [currentFilters]);
  const location = useLocation();
  return <output>{location.search}</output>;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(
  skills: ManagedSkill[],
  groupId?: string,
  viewingUngrouped = false,
  entry = "/my-skills?deployment=undeployed&keep=value",
) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Harness
          skills={skills}
          groupId={groupId}
          viewingUngrouped={viewingUngrouped}
        />
      </MemoryRouter>,
    ),
  );
}

const skills: ManagedSkill[] = [
  {
    ...makeSkill(1),
    source_type: "git",
    tags: ["dev"],
    skill_group_ids: ["first"],
  },
  { ...makeSkill(2, true), tags: ["docs"], skill_group_ids: ["second"] },
  { ...makeSkill(3), skill_group_ids: [] },
];

it("clears every previous filter and the deployment query when switching skill groups", async () => {
  await render(skills, "first");
  await act(async () => {
    filters.setSearch("demo-skill-1");
    filters.setSources(new Set(["git"]));
    filters.setTags(new Set(["dev"]));
    filters.setMembership("available");
  });
  expect(filters.filtered).toHaveLength(0);
  // A simultaneous data refresh must not restore the old selected tag.
  await render([...skills], "second");
  expect(filters.search).toBe("");
  expect(filters.sources.size).toBe(0);
  expect(filters.tags.size).toBe(0);
  expect(filters.ungrouped).toBe(false);
  expect(filters.deployment).toBe("all");
  expect(filters.membership).toBe("enabled");
  expect(filters.filtered.map((skill) => skill.id)).toEqual(["skill-2"]);
  expect(container.textContent).toBe("?keep=value");
});

it("clears ungrouped filtering when entering a group and resets when changing library scopes", async () => {
  await render(skills);
  await act(async () => filters.setUngrouped(true));
  expect(filters.filtered.map((skill) => skill.id)).toEqual(["skill-3"]);
  await render(skills, "second");
  expect(filters.ungrouped).toBe(false);
  expect(filters.filtered.map((skill) => skill.id)).toEqual(["skill-2"]);
  await act(async () => filters.setSearch("demo-skill-2"));
  await render(skills, undefined, true);
  expect(filters.search).toBe("");
  expect(filters.membership).toBe("all");
  expect(filters.filtered.map((skill) => skill.id)).toEqual(["skill-3"]);
  await act(async () => filters.setTags(new Set(["dev"])));
  await render(skills);
  expect(filters.tags.size).toBe(0);
  expect(filters.filtered).toHaveLength(3);
});

it("preserves filters and a direct undeployed entry during refresh within the same group", async () => {
  await render(skills, "first");
  expect(filters.deployment).toBe("undeployed");
  await act(async () => {
    filters.setSearch("demo-skill-1");
    filters.setSources(new Set(["git"]));
    filters.setTags(new Set(["dev"]));
  });
  await render([...skills], "first");
  expect(filters.search).toBe("demo-skill-1");
  expect([...filters.sources]).toEqual(["git"]);
  expect([...filters.tags]).toEqual(["dev"]);
  expect(filters.deployment).toBe("undeployed");
  expect(container.textContent).toBe("?deployment=undeployed&keep=value");
  expect(filters.filtered.map((skill) => skill.id)).toEqual(["skill-1"]);
});

it("applies the dashboard grouping query within All Skills and combines other filters", async () => {
  await render(
    skills,
    undefined,
    false,
    "/my-skills?grouping=ungrouped&keep=value",
  );
  expect(filters.ungrouped).toBe(true);
  expect(filters.filtered.map((skill) => skill.id)).toEqual(["skill-3"]);
  await act(async () => filters.setSearch("no-match"));
  expect(filters.filtered).toHaveLength(0);
  await act(async () => filters.clearFilters());
  expect(filters.filtered).toHaveLength(3);
  expect(container.textContent).toBe("?keep=value");
});

it("clears both dashboard query filters together and removes them on a group change", async () => {
  await render(
    skills,
    undefined,
    false,
    "/my-skills?deployment=undeployed&grouping=ungrouped&keep=value",
  );
  expect(filters.filtered.map((skill) => skill.id)).toEqual(["skill-3"]);
  await act(async () => filters.clearFilters());
  expect(filters.deployment).toBe("all");
  expect(filters.ungrouped).toBe(false);
  expect(container.textContent).toBe("?keep=value");
  await act(async () => filters.setUngrouped(true));
  await render(skills, "first");
  expect(filters.ungrouped).toBe(false);
  expect(container.textContent).toBe("?keep=value");
});
