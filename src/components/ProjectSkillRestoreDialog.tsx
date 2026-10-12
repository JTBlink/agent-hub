import { useTranslation } from "react-i18next";
import type { ProjectSkillEntry } from "../lib/projectSkillEntries";
import { ConfirmDialog } from "./ConfirmDialog";

export function ProjectSkillRestoreDialog({
  skills,
  onClose,
  onConfirm,
}: {
  skills: ProjectSkillEntry[] | null;
  onClose: () => void;
  onConfirm: () => Promise<void | false>;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={skills !== null}
      title={t("project.restoreConfirmTitle")}
      message={t("project.restoreConfirmMessage", {
        name: skills?.map((skill) => skill.name).join(", "),
      })}
      details={skills?.map((skill) => skill.name)}
      confirmLabel={t("project.restoreConfirmAction")}
      tone="warning"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
