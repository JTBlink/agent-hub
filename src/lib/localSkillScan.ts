import type { DiscoveredGroup } from "./tauri";

export interface LocalSkillSelection {
  name: string;
  location: DiscoveredGroup["locations"][number];
}

/** Distinct versions of the same name must not share rename or React state. */
export function discoveredGroupKey(group: DiscoveredGroup): string {
  return JSON.stringify([
    group.name,
    group.fingerprint ?? group.locations[0]?.found_path,
  ]);
}

export function filterDiscoveredGroups(
  groups: DiscoveredGroup[],
  query: string,
  agent: string,
): DiscoveredGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  return groups.flatMap((group) => {
    const locations = group.locations.filter(
      (location) =>
        (!agent || location.tool === agent) &&
        (!needle ||
          `${group.name} ${location.tool} ${location.found_path}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
    return locations.length ? [{ ...group, locations }] : [];
  });
}
