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
  const [resetDeployment, setResetDeployment] = useState(false);
  const value = params.get("deployment");
  const deployment: DeploymentFilter =
    !resetDeployment && (value === "deployed" || value === "undeployed")
      ? value
      : "all";
  if (resetDeployment && !params.has("deployment")) {
    setResetDeployment(false);
  }
  // Synchronize the URL after a scope switch. Local filters reset during render,
  // so the new group never renders with the previous group's conditions.
  useEffect(() => {
    if (!resetDeployment) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("deployment");
        return next;
      },
      { replace: true },
    );
  }, [resetDeployment, setParams]);
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
  const [ungrouped, setUngrouped] = useState(false);
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
    setUngrouped(false);
    setMembership(groupId && !viewingUngrouped ? "enabled" : "all");
    setResetDeployment(params.has("deployment"));
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
    setUngrouped(false);
    setMembership("all");
    setDeployment("all");
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
