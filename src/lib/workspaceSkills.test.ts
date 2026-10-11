import { describe, expect, it } from "vitest";
import type { ProjectSkill } from "./tauri";
import {
  filterWorkspaceSkills,
  isManagedWorkspaceSkill,
} from "./workspaceSkills";
import { UNTAGGED_FILTER } from "./skillTags";

type Row = Pick<
  ProjectSkill,
  | "name"
  | "dir_name"
  | "description"
  | "tags"
  | "center_skill_id"
  | "sync_status"
>;
const rows: Row[] = [
  {
    name: "managed",
    dir_name: "managed",
    description: "managed browser",
    tags: ["dev"],
    center_skill_id: "deployed",
    sync_status: "in_sync",
  },
  {
    name: "local",
    dir_name: "local-folder",
    description: "local browser",
    tags: ["dev"],
    center_skill_id: null,
    sync_status: "project_only",
  },
  {
    name: "matched",
    dir_name: "matched",
    description: null,
    tags: [],
    center_skill_id: "matched-without-deployment",
    sync_status: "in_sync",
  },
];
const managedIds = new Set(["deployed"]);

describe("unmanaged workspace skills", () => {
  it("shows both local-only and library-matched skills without managed deployments", () => {
    expect(
      filterWorkspaceSkills(rows, "", new Set(), managedIds, true).map(
        (row) => row.name,
      ),
    ).toEqual(["local", "matched"]);
    expect(isManagedWorkspaceSkill(rows[2], managedIds)).toBe(false);
  });
  it("restores all skills when the unmanaged filter is turned off", () => {
    expect(
      filterWorkspaceSkills(rows, "", new Set(), managedIds, false),
    ).toHaveLength(3);
    expect(rows.map((row) => row.name)).toEqual([
      "managed",
      "local",
      "matched",
    ]);
  });
  it("combines unmanaged filtering with name, directory, description and tags", () => {
    expect(
      filterWorkspaceSkills(
        rows,
        " BROWSER ",
        new Set(["dev"]),
        managedIds,
        true,
      ).map((row) => row.name),
    ).toEqual(["local"]);
    expect(
      filterWorkspaceSkills(rows, "local-folder", new Set(), managedIds, true),
    ).toEqual([rows[1]]);
    expect(
      filterWorkspaceSkills(
        rows,
        "matched",
        new Set([UNTAGGED_FILTER]),
        managedIds,
        true,
      ),
    ).toEqual([rows[2]]);
  });
  it("removes a skill from unmanaged results once its deployment is recorded", () => {
    expect(
      filterWorkspaceSkills(
        rows,
        "",
        new Set(),
        new Set(["deployed", "matched-without-deployment"]),
        true,
      ),
    ).toEqual([rows[1]]);
  });
});
