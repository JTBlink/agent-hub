import type { TFunction } from "i18next";

/** Localize the default label at render time without renaming stored groups. */
export function getSkillGroupDisplayName(name: string, t: TFunction): string {
  return name === "Default" ? t("skillGroup.defaultName") : name;
}

export function getSkillGroupDisplayDescription(
  group: { name: string; description?: string | null },
  t: TFunction,
): string | null | undefined {
  return group.name === "Default" &&
    group.description === "Default startup scenario"
    ? t("skillGroup.defaultDescription")
    : group.description;
}
