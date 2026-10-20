import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
  managedSkills: ManagedSkill[],
) {
  const { t } = useTranslation();
  const [skillsByAgent, setSkillsByAgent] = useState<
    Record<string, ProjectSkill[]>
  >({});
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    const results = await Promise.all(
      agentKeys.map(async (agent) => {
        try {
          return [agent, await getGlobalLocalSkills(agent)] as const;
        } catch (error) {
          if (requestRef.current === request && agent === currentAgent) {
            toast.error(getErrorMessage(error, t("common.error")));
          }
          return [agent, null] as const;
        }
      }),
    );
    if (requestRef.current !== request) return;
    const next: Record<string, ProjectSkill[]> = {};
    for (const [agent, skills] of results) {
      // A failed scan is unknown, not an empty directory: use deployment records
      // as fallback rather than treating every group as absent.
      if (skills !== null) next[agent] = skills;
    }
    setSkillsByAgent(next);
    setLoading(false);
  }, [agentKeys, currentAgent, t]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return refresh();
    });
    return () => {
      cancelled = true;
      requestRef.current += 1;
    };
    // File watcher and membership refreshes supply a new array even when the
    // count is unchanged. Rescan on every such notification, including copies
    // installed or removed outside the app.
  }, [refresh, managedSkills]);

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
