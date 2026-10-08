import { describe, expect, it } from "vitest";
import {
  discoveredGroupKey,
  discoveredSkillCounts,
  filterDiscoveredGroups,
  uniqueDiscoveredLocations,
} from "./localSkillScan";
import type { DiscoveredGroup } from "./tauri";

const group: DiscoveredGroup = {
  name: "demo",
  fingerprint: "version-a",
  imported: false,
  found_at: 0,
  locations: [
    {
      id: "a",
      tool: "codex",
      found_path: "<workspace>/codex/demo",
      is_symlink: false,
    },
    {
      id: "b",
      tool: "hermes",
      found_path: "<workspace>/hermes/demo",
      is_symlink: false,
    },
  ],
};

describe("local skill scan management", () => {
  it("keeps same-name versions separate when renaming and rendering", () => {
    expect(discoveredGroupKey(group)).not.toBe(
      discoveredGroupKey({ ...group, fingerprint: "version-b" }),
    );
    expect(discoveredGroupKey({ ...group, fingerprint: null })).not.toBe(
      discoveredGroupKey({
        ...group,
        fingerprint: null,
        locations: [group.locations[1]],
      }),
    );
  });

  it("searches names and paths", () => {
    expect(
      filterDiscoveredGroups(uniqueDiscoveredLocations([group]), " DEMO ")[0]
        .locations,
    ).toEqual(uniqueDiscoveredLocations([group])[0].locations);
    expect(
      filterDiscoveredGroups(uniqueDiscoveredLocations([group]), "/hermes/")[0]
        .locations,
    ).toEqual([{ ...group.locations[1], tools: ["hermes"] }]);
    expect(
      filterDiscoveredGroups(uniqueDiscoveredLocations([group]), "missing"),
    ).toEqual([]);
  });

  it("searches the real path of a symlink", () => {
    const linked = {
      ...group,
      locations: [
        {
          ...group.locations[0],
          is_symlink: true,
          resolved_path: "<workspace>/.agents/skills/demo",
        },
      ],
    };
    expect(
      filterDiscoveredGroups(uniqueDiscoveredLocations([linked]), ".agents")
        .length,
    ).toBe(1);
  });

  it("merges shared paths while retaining an actionable record and independent copies", () => {
    const shared = {
      id: "shared",
      tool: "codex",
      found_path: "<workspace>/.agents/skills/demo",
      is_symlink: true,
    };
    const input = {
      ...group,
      locations: [
        shared,
        { ...shared, id: "alias", tool: "cline" },
        group.locations[1],
      ],
    };
    const [result] = uniqueDiscoveredLocations([input]);
    expect(result.locations).toEqual([
      { ...shared, tools: ["codex", "cline"] },
      { ...group.locations[1], tools: ["hermes"] },
    ]);
    expect(input.locations).toHaveLength(3);
    expect(filterDiscoveredGroups([result], "cline")[0].locations).toEqual([
      result.locations[0],
    ]);
    expect(filterDiscoveredGroups([result], ".agents")[0].locations).toEqual([
      { ...shared, tools: ["codex", "cline"] },
    ]);
  });

  it("keeps distinct versions and distinct paths even when their contents match", () => {
    const version = { ...group, fingerprint: "version-b" };
    const result = uniqueDiscoveredLocations([group, version]);
    expect(result.map((g) => g.fingerprint)).toEqual([
      "version-a",
      "version-b",
    ]);
    expect(result.map((g) => g.locations.map((l) => l.found_path))).toEqual(
      [group, version].map((g) => g.locations.map((l) => l.found_path)),
    );
    expect(
      uniqueDiscoveredLocations([{ ...group, locations: [] }])[0].locations,
    ).toEqual([]);
  });

  it("counts Skills separately from their merged physical directories", () => {
    const [result] = uniqueDiscoveredLocations([group]);
    expect(discoveredSkillCounts([result])).toEqual({
      skills: 1,
      directories: 2,
    });
  });
});
