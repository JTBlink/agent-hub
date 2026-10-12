import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../lib/tauri";
import { getErrorKind, getErrorMessage } from "../lib/error";
import type { ProjectSkillEntry } from "../lib/projectSkillEntries";

function requiresConfirmation(skill: ProjectSkillEntry) {
  return (
    skill.variants.some((variant) => variant.sync_status === "project_newer") ||
    skill.teamStatus?.modified ||
    skill.teamStatus?.target_issues?.some(
      (issue) => issue.reason === "content_mismatch",
    )
  );
}

async function restoreEntry(
  projectId: string,
  skill: ProjectSkillEntry,
  force: boolean,
  isCurrent: () => boolean,
) {
  // One managed update publishes the central version and every existing entry.
  const variants = skill.teamStatus ? [skill.primaryVariant] : skill.variants;
  for (const variant of variants) {
    if (!isCurrent()) return false;
    await api.updateProjectSkillFromCenter(
      projectId,
      variant.relative_path,
      variant.agent,
      force,
    );
  }
  return true;
}

/** Scope confirmation and writes to the selected project, shared by every entry point. */
export function useProjectSkillRestore(
  projectId: string | undefined,
  onChanged: () => Promise<void>,
) {
  const { t } = useTranslation();
  const scope = useMemo(() => ({ projectId }), [projectId]);
  type Request = {
    scope: typeof scope;
    skills: ProjectSkillEntry[];
    batch: boolean;
  };
  const [confirmation, setConfirmation] = useState<Request | null>(null);
  const [pending, setPending] = useState<
    (Request & { skillId: string }) | null
  >(null);
  const busy = useRef<typeof scope | null>(null);
  const active = useRef<typeof scope | null>(null);
  useEffect(() => {
    active.current = scope;
    return () => {
      active.current = null;
    };
  }, [scope]);

  const execute = useCallback(
    async (
      skills: ProjectSkillEntry[],
      batch: boolean,
      force: boolean,
    ): Promise<boolean> => {
      if (!projectId || busy.current === scope || skills.length === 0)
        return false;
      busy.current = scope;
      setPending({ scope, skills, batch, skillId: skills[0].id });
      let updated = 0;
      let failed = 0;
      const failedSkills: ProjectSkillEntry[] = [];
      const protectedSkills: ProjectSkillEntry[] = [];
      try {
        for (const skill of skills) {
          if (active.current !== scope) return false;
          setPending({ scope, skills, batch, skillId: skill.id });
          try {
            if (
              !(await restoreEntry(
                projectId,
                skill,
                force,
                () => active.current === scope,
              ))
            )
              return false;
            updated++;
          } catch (error) {
            if (active.current !== scope) return false;
            if (!force && getErrorKind(error) === "project_restore_required") {
              protectedSkills.push(skill);
            } else {
              failed++;
              failedSkills.push(skill);
              if (!batch)
                toast.error(
                  t("project.updateProjectFailed", {
                    name: skill.name,
                    reason: getErrorMessage(error, t("common.error")),
                  }),
                );
            }
          }
        }
        if (active.current !== scope) return false;
        await onChanged();
        if (active.current !== scope) return false;
        if (protectedSkills.length > 0)
          setConfirmation({ scope, skills: protectedSkills, batch });
        else if (force && failedSkills.length > 0)
          setConfirmation({ scope, skills: failedSkills, batch });
        if (updated > 0)
          toast.success(
            batch
              ? t("project.batchUpdatedProject", { count: updated })
              : t(
                  force || skills[0].status === "project_newer"
                    ? "project.resetFromCenterSuccess"
                    : "project.updateProjectSuccess",
                  { name: skills[0].name },
                ),
          );
        if (batch && failed > 0)
          toast.error(t("project.batchUpdateProjectFailed", { count: failed }));
        return failed === 0 && protectedSkills.length === 0;
      } catch (error) {
        if (active.current === scope)
          toast.error(getErrorMessage(error, t("common.error")));
        return false;
      } finally {
        if (busy.current === scope) busy.current = null;
        if (active.current === scope) setPending(null);
      }
    },
    [projectId, scope, onChanged, t],
  );

  const request = useCallback(
    async (skills: ProjectSkillEntry[], batch: boolean) => {
      if (!projectId || busy.current === scope || skills.length === 0) return;
      if (skills.some(requiresConfirmation))
        setConfirmation({ scope, skills, batch });
      else await execute(skills, batch, false);
    },
    [projectId, scope, execute],
  );
  const confirm = useCallback(async (): Promise<void | false> => {
    if (!confirmation || confirmation.scope !== scope) return false;
    const success = await execute(
      confirmation.skills,
      confirmation.batch,
      true,
    );
    if (!success) return false;
    if (active.current === scope) setConfirmation(null);
  }, [confirmation, scope, execute]);
  const cancel = useCallback(() => {
    if (busy.current !== scope) setConfirmation(null);
  }, [scope]);

  return {
    confirmation: confirmation?.scope === scope ? confirmation : null,
    updatingSkill: pending?.scope === scope ? pending.skillId : null,
    batchUpdating: pending?.scope === scope && pending.batch,
    request: (skill: ProjectSkillEntry) => request([skill], false),
    requestBatch: (skills: ProjectSkillEntry[]) =>
      request(
        skills.filter((skill) =>
          ["project_newer", "center_newer", "diverged"].includes(skill.status),
        ),
        true,
      ),
    confirm,
    cancel,
  };
}
