import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import i18n from "../i18n";
import { getErrorMessage } from "../lib/error";
import {
  getGlobalLocalSkills,
  type ManagedSkill,
  type ProjectSkill,
} from "../lib/tauri";

/** Share one filesystem snapshot between workspace counts, cards and group chips. */
export function useWorkspaceSkills(
  agentKeys: string[],
  currentAgent: string | null,
) {
  // Context refreshes create new Tool objects and arrays. Only a different
  // visible Agent scope should automatically trigger another directory scan.
  const scope = JSON.stringify([...agentKeys].sort());
  const [skillsByAgent, setSkillsByAgent] = useState<
    Record<string, ProjectSkill[]>
  >({});
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    const agents: string[] = JSON.parse(scope);
    const results = await Promise.all(
      agents.map(async (agent) => {
        try {
          return [agent, await getGlobalLocalSkills(agent)] as const;
        } catch (error) {
          if (requestRef.current === request && agent === currentAgent) {
            toast.error(getErrorMessage(error, i18n.t("common.error")));
          }
          return [agent, null] as const;
        }
      }),
    );
    if (requestRef.current !== request) return;
    const next: Record<string, ProjectSkill[]> = {};
    for (const [agent, skills] of results) {
      // A failed scan must not replace a valid snapshot with an empty directory.
      if (skills !== null) next[agent] = skills;
    }
    // Failed refreshes retain the last successful snapshot. Before a first
    // successful scan, presence still falls back to deployment records.
    setSkillsByAgent((previous) => ({ ...previous, ...next }));
    setLoading(false);
  }, [scope, currentAgent]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return refresh();
    });
    return () => {
      cancelled = true;
      requestRef.current += 1;
    };
  }, [refresh]);

  const installedIdsByAgent = useMemo(
    () =>
      new Map(
        Object.entries(skillsByAgent).map(([agent, skills]) => [
          agent,
          new Set(
            skills.flatMap((skill) =>
              skill.center_skill_id ? [skill.center_skill_id] : [],
            ),
          ),
        ]),
      ),
    [skillsByAgent],
  );

  const existsInWorkspace = useCallback(
    (skill: ManagedSkill, agent: string) => {
      const installed = installedIdsByAgent.get(agent);
      return installed
        ? installed.has(skill.id)
        : skill.targets.some((target) => target.tool === agent);
    },
    [installedIdsByAgent],
  );

  return { skillsByAgent, loading, refresh, existsInWorkspace };
}
