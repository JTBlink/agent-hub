import { useTranslation } from "react-i18next";
import {
  enabledProjectAgentNames,
  type BatchProjectSkill,
} from "../lib/projectBatchAgents";

/** Show native project deployment status with readable agent names. */
export function ProjectEnabledAgents({
  variants,
}: {
  variants: BatchProjectSkill["variants"];
}) {
  const { t } = useTranslation();
  const names = enabledProjectAgentNames(variants);
  return (
    <p
      className="mt-1 text-[11px] leading-4 text-muted"
      title={t("project.batchAgents.statusHint")}
    >
      {t("project.batchAgents.enabledOn", {
        agents: names.join("、") || t("project.batchAgents.none"),
      })}
    </p>
  );
}
