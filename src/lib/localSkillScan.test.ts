import { describe, expect, it } from "vitest";
import { discoveredGroupKey, filterDiscoveredGroups } from "./localSkillScan";
import type { DiscoveredGroup } from "./tauri";

const group: DiscoveredGroup = {
  name: "demo",
  fingerprint: "version-a",
  imported: false,
  found_at: 0,
  locations: [
    { id: "a", tool: "codex", found_path: "<workspace>/codex/demo" },
    { id: "b", tool: "hermes", found_path: "<workspace>/hermes/demo" },
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

  it("only exposes the selected Agent's installation for management", () => {
    expect(
      filterDiscoveredGroups([group], " DEMO ", "hermes")[0].locations,
    ).toEqual([group.locations[1]]);
    expect(filterDiscoveredGroups([group], "missing", "hermes")).toEqual([]);
    expect(group.locations).toHaveLength(2);
  });
});
