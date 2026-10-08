import type { DiscoveredGroup } from "./tauri";

export type DiscoveredDirectory = DiscoveredGroup["locations"][number] & {
  tools: string[];
};

export type DirectoryGroup = Omit<DiscoveredGroup, "locations"> & {
  locations: DiscoveredDirectory[];
};

export interface LocalSkillSelection {
  name: string;
  location: DiscoveredDirectory;
}

/** Count Skills separately from their physical paths and Agent scan records. */
export function discoveredSkillCounts(groups: DirectoryGroup[]) {
  return {
    skills: groups.length,
    directories: new Set(
      groups.flatMap((group) =>
        group.locations.map((location) => location.found_path),
      ),
    ).size,
  };
}

/** Distinct versions of the same name must not share rename or React state. */
export function discoveredGroupKey(group: DiscoveredGroup): string {
  return JSON.stringify([
    group.name,
    group.fingerprint ?? group.locations[0]?.found_path,
  ]);
}

/** Keep one actionable scan record per path, without merging symlink aliases. */
export function uniqueDiscoveredLocations(
  groups: DiscoveredGroup[],
): DirectoryGroup[] {
  return groups.map((group) => {
    const directories = new Map<string, DiscoveredDirectory>();
    for (const location of group.locations) {
      const existing = directories.get(location.found_path);
      if (existing) {
        if (!existing.tools.includes(location.tool))
          existing.tools.push(location.tool);
      } else {
        directories.set(location.found_path, {
          ...location,
          tools: [location.tool],
        });
      }
    }
    return { ...group, locations: [...directories.values()] };
  });
}

export function filterDiscoveredGroups(
  groups: DirectoryGroup[],
  query: string,
): DirectoryGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  return groups.flatMap((group) => {
    const locations = group.locations.filter(
      (location) =>
        !needle ||
        `${group.name} ${location.found_path} ${location.tools.join(" ")}`
          .toLocaleLowerCase()
          .includes(needle),
    );
    return locations.length ? [{ ...group, locations }] : [];
  });
}
