import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import i18n from "../i18n";
import { getErrorMessage } from "../lib/error";
import type { ManagedSkill } from "../lib/tauri";
import { workspaceSkillsCache as cache } from "../lib/workspaceSkillsCache";

/** Share one filesystem snapshot between workspace counts, cards and group chips. */
export function useWorkspaceSkills(
  agentKeys: string[],
  currentAgent: string | null,
) {
  // Context refreshes create new Tool objects and arrays. Only a different
  // visible Agent scope should automatically trigger another directory scan.
  const scope = JSON.stringify([...agentKeys].sort());
  const skillsByAgent = useSyncExternalStore(
    cache.subscribe,
    cache.getSnapshot,
  );
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      const request = ++requestRef.current;
      setLoading(true);
      const agents: string[] = JSON.parse(scope);
      await Promise.all(
        agents.map(async (agent) => {
          const error = await cache.load(agent, force);
          if (
            error &&
            requestRef.current === request &&
            agent === currentAgent
          ) {
            toast.error(getErrorMessage(error, i18n.t("common.error")));
          }
        }),
      );
      if (requestRef.current !== request) return;
      setLoading(false);
    },
    [scope, currentAgent],
  );
  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return load(false);
    });
    return () => {
      cancelled = true;
      requestRef.current += 1;
    };
  }, [load]);

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
