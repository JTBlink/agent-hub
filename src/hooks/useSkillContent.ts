import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../lib/error";
import {
  canRefreshSkill,
  isLocalSkillSource,
} from "../lib/skillUpdatePresentation";
import {
  getSkillDocument,
  getSourceSkillDocument,
  getSkillSourceDiff,
  type ManagedSkill,
} from "../lib/tauri";

export type SkillContentTab = "central" | "source" | "diff";

function useContentResource<T>(
  key: string,
  enabled: boolean,
  load: () => Promise<T>,
) {
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setResult({ key, data });
      },
      (error) => {
        if (!cancelled)
          setResult({ key, error: getErrorMessage(error, String(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, enabled, load]);
  const active = result?.key === key ? result : undefined;
  return {
    data: active?.data,
    error: active?.error,
    loading: enabled && !active,
  };
}

/** Refresh content without losing the selected tab; discard obsolete responses. */
export function useSkillContent(skill: ManagedSkill) {
  const [tab, setTab] = useState<SkillContentTab>("central");
  const [refreshCount, setRefreshCount] = useState(0);
  const [sourceRequested, setSourceRequested] = useState(false);
  const [diffRequested, setDiffRequested] = useState(false);
  const comparable = canRefreshSkill(skill);
  const local = isLocalSkillSource(skill);
  const key = JSON.stringify([
    skill.id,
    skill.updated_at,
    skill.source_type,
    skill.source_ref,
    skill.source_ref_resolved,
    skill.source_branch,
    skill.source_subpath,
    skill.source_revision,
    skill.remote_revision,
    refreshCount,
  ]);
  const centralLoad = useCallback(() => getSkillDocument(skill.id), [skill.id]);
  const sourceLoad = useCallback(
    () => getSourceSkillDocument(skill.id),
    [skill.id],
  );
  const diffLoad = useCallback(() => getSkillSourceDiff(skill.id), [skill.id]);
  const central = useContentResource(key, true, centralLoad);
  const source = useContentResource(
    key,
    comparable && sourceRequested,
    sourceLoad,
  );
  const diff = useContentResource(
    key,
    comparable && (local || diffRequested),
    diffLoad,
  );
  function select(next: SkillContentTab) {
    setTab(next);
    if (next === "source") setSourceRequested(true);
    if (next === "diff") setDiffRequested(true);
  }
  return {
    tab: comparable ? tab : "central",
    select,
    comparable,
    local,
    central,
    source,
    diff,
    refresh: () => setRefreshCount((value) => value + 1),
  };
}
