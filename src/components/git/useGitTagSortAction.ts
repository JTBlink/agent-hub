import { useTranslation } from "react-i18next";
import type { CardSubmenuAction } from "../CardActionMenu";
import type { GitTagSort } from "../../lib/gitTagSort";

export function useGitTagSortAction(
  sort?: GitTagSort,
  onChange?: (sort: GitTagSort) => void,
): CardSubmenuAction | undefined {
  const { t } = useTranslation();
  if (!sort || !onChange) return undefined;
  return {
    key: "tag-sort",
    label: t("git.tagSort.title"),
    submenu: [
      ...(["date", "name", "version"] as const).map((by) => ({
        key: by,
        label: t(`git.tagSort.${by}`),
        checked: sort.by === by,
        onSelect: () => onChange({ ...sort, by }),
      })),
      ...(["desc", "asc"] as const).map((direction, index) => ({
        key: direction,
        label: t(`git.tagSort.${direction}`),
        checked: sort.direction === direction,
        separatorBefore: index === 0,
        onSelect: () => onChange({ ...sort, direction }),
      })),
    ],
  };
}
