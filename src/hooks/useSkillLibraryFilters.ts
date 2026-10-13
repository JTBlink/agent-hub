import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ManagedSkill } from "../lib/tauri";
import { pruneStaleTagFilters } from "../lib/skillTags";
import {
  filterSkillLibrary,
  skillLibraryDisplayNames,
  type DeploymentFilter,
  type MembershipFilter,
} from "../lib/skillLibraryFilters";

export function useSkillLibraryFilters(
  skills: ManagedSkill[],
  allTags: string[],
  groupId: string | undefined,
  viewingUngrouped: boolean,
  order: string[],
) {
  const [params, setParams] = useSearchParams();
  const [resetUrlFilters, setResetUrlFilters] = useState(false);
  const value = params.get("deployment");
  const deployment: DeploymentFilter =
    !resetUrlFilters && (value === "deployed" || value === "undeployed")
      ? value
      : "all";
  if (resetUrlFilters && !params.has("deployment") && !params.has("grouping")) {
    setResetUrlFilters(false);
  }
  // Synchronize the URL after a scope switch. Local filters reset during render,
  // so the new group never renders with the previous group's conditions.
  useEffect(() => {
    if (!resetUrlFilters) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("deployment");
        next.delete("grouping");
        return next;
      },
      { replace: true },
    );
  }, [resetUrlFilters, setParams]);
  const setDeployment = (mode: DeploymentFilter) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (mode === "all") next.delete("deployment");
        else next.set("deployment", mode);
        return next;
      },
      { replace: true },
    );
  };
  const [search, setSearch] = useState("");
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<Set<string>>(new Set());
  const ungrouped = !resetUrlFilters && params.get("grouping") === "ungrouped";
  const setUngrouped = (
    selected: boolean | ((current: boolean) => boolean),
  ) => {
    const nextSelected =
      typeof selected === "function" ? selected(ungrouped) : selected;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (nextSelected) next.set("grouping", "ungrouped");
        else next.delete("grouping");
        return next;
      },
      { replace: true },
    );
  };
  const [membership, setMembership] = useState<MembershipFilter>(
    groupId ? "enabled" : "all",
  );

  const scope = `${groupId ?? ""}:${viewingUngrouped}`;
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setSearch("");
    setSources(new Set());
    setTags(new Set());
    setMembership(groupId && !viewingUngrouped ? "enabled" : "all");
    setResetUrlFilters(params.has("deployment") || params.has("grouping"));
  }

  // Prune only when the available data changes. A rename can update the chosen
  // tag before refreshed skills arrive, so checking on every render would lose it.
  const [previousData, setPreviousData] = useState({ skills, allTags });
  if (previousData.skills !== skills || previousData.allTags !== allTags) {
    setPreviousData({ skills, allTags });
    if (skills.length > 0 && previousScope === scope) {
      const cleaned = pruneStaleTagFilters(
        tags,
        [...allTags, ...skills.flatMap((skill) => skill.tags)],
        skills.some((skill) => skill.tags.length === 0),
      );
      if (cleaned !== tags) setTags(cleaned);
    }
  }

  const displayNames = useMemo(
    () => skillLibraryDisplayNames(skills),
    [skills],
  );
  const result = useMemo(
    () =>
      filterSkillLibrary(
        skills,
        displayNames,
        { search, sources, tags, ungrouped, membership, deployment },
        groupId,
        viewingUngrouped,
        order,
      ),
    [
      skills,
      displayNames,
      search,
      sources,
      tags,
      ungrouped,
      membership,
      deployment,
      groupId,
      viewingUngrouped,
      order,
    ],
  );
  const hasActiveFilters =
    search.trim() !== "" ||
    sources.size > 0 ||
    tags.size > 0 ||
    ungrouped ||
    membership !== "all" ||
    deployment !== "all";
  const clearFilters = () => {
    setSearch("");
    setSources(new Set());
    setTags(new Set());
    setMembership("all");
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("deployment");
        next.delete("grouping");
        return next;
      },
      { replace: true },
    );
  };
  return {
    ...result,
    displayNames,
    search,
    setSearch,
    sources,
    setSources,
    tags,
    setTags,
    ungrouped,
    setUngrouped,
    membership,
    setMembership,
    deployment,
    setDeployment,
    hasActiveFilters,
    clearFilters,
    filterSignal: JSON.stringify([
      search,
      [...sources].sort(),
      [...tags].sort(),
      ungrouped,
      membership,
      deployment,
      groupId ?? null,
      viewingUngrouped,
    ]),
  };
}
