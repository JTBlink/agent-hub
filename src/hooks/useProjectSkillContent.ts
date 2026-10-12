import { useCallback, useState } from "react";
import {
  getProjectSkillDocument,
  getSkillDocument,
  getProjectSkillDiff,
  type ProjectSkill,
} from "../lib/tauri";
import { useContentResource } from "./useSkillContent";

export type ProjectContentTab = "local" | "diff" | "center";

/** Keep comparison tied to the selected workspace variant, discarding obsolete responses. */
export function useProjectSkillContent(
  projectId: string,
  variant: ProjectSkill,
) {
  const [tab, setTab] = useState<ProjectContentTab>("local");
  const [refreshCount, setRefreshCount] = useState(0);
  const centerId = variant.center_skill_id;
  const key = JSON.stringify([projectId, variant, refreshCount]);
  const localLoad = useCallback(
    () =>
      getProjectSkillDocument(projectId, variant.relative_path, variant.agent),
    [projectId, variant.relative_path, variant.agent],
  );
  const centerLoad = useCallback(
    () => getSkillDocument(centerId ?? ""),
    [centerId],
  );
  const diffLoad = useCallback(
    () => getProjectSkillDiff(projectId, variant.relative_path, variant.agent),
    [projectId, variant.relative_path, variant.agent],
  );
  const local = useContentResource(key, true, localLoad);
  const center = useContentResource(key, Boolean(centerId), centerLoad);
  const diff = useContentResource(key, Boolean(centerId), diffLoad);
  return {
    tab: centerId ? tab : "local",
    select: setTab,
    local,
    center,
    diff,
    comparable: Boolean(centerId),
    refresh: () => setRefreshCount((value) => value + 1),
  };
}
