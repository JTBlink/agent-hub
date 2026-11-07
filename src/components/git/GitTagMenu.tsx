import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { CardActionMenu, type CardMenuAction } from "../CardActionMenu";
import { useGitTagActions } from "./useGitTagActions";
import type { GitTagSort } from "../../lib/gitTagSort";
import { useGitTagSortAction } from "./useGitTagSortAction";

export function GitTagMenu({
  contextTarget,
  contextOnly,
  className,
  sort,
  onSortChange,
  ...options
}: Parameters<typeof useGitTagActions>[0] & {
  contextTarget: RefObject<HTMLElement | null>;
  contextOnly?: boolean;
  className?: string;
  sort?: GitTagSort;
  onSortChange?: (sort: GitTagSort) => void;
}) {
  const { t } = useTranslation();
  const actions: CardMenuAction[] = useGitTagActions(options);
  const sortAction = useGitTagSortAction(sort, onSortChange);
  if (sortAction) {
    const refreshIndex = actions.findIndex(
      (action) => action.key === "refresh",
    );
    actions.splice(refreshIndex < 0 ? actions.length : refreshIndex, 0, {
      ...sortAction,
      separatorBefore: true,
    });
  }
  return (
    <CardActionMenu
      contextTarget={contextTarget}
      contextOnly={contextOnly}
      className={className}
      label={t("git.referenceActions")}
      actions={actions}
    />
  );
}
