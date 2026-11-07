import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";
import type { GitTagSort } from "../../lib/gitTagSort";
import { useGitTagSortAction } from "./useGitTagSortAction";

export function GitTagSortMenu({
  contextTarget,
  sort,
  onChange,
}: {
  contextTarget: RefObject<HTMLElement | null>;
  sort: GitTagSort;
  onChange: (sort: GitTagSort) => void;
}) {
  const { t } = useTranslation();
  const action = useGitTagSortAction(sort, onChange);
  return (
    <CardActionMenu
      contextTarget={contextTarget}
      label={t("git.tagSort.menu")}
      actions={action ? [action] : []}
    />
  );
}
