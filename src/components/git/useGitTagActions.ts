import { useContext } from "react";
import { useTranslation } from "react-i18next";
import type { CardAction } from "../CardActionMenu";
import { GitReferenceActionsContext } from "./gitReferenceActions";
import { useGitCopyActions } from "./useGitCopyActions";
import type { GitTagAction } from "../../lib/gitApi";

/** Tag-specific command order shared by the list and graph; menu mechanics stay generic. */
export function useGitTagActions({
  name,
  sha,
  onDetails,
  expanded,
  onExpandedChange,
  onRefresh,
}: {
  name: string;
  sha: string | null;
  onDetails?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onRefresh?: () => void;
}): CardAction[] {
  const { t } = useTranslation();
  const context = useContext(GitReferenceActionsContext);
  const copies = useGitCopyActions([
    { key: "copy-name", label: t("git.copyTagName"), text: name },
    ...(sha
      ? [{ key: "copy-sha", label: t("git.copyCommitSha"), text: sha }]
      : []),
  ]);
  const actions: CardAction[] = [];
  if (context) {
    actions.push({
      key: "graph",
      label: t("git.tagActions.openGraph"),
      disabled: !sha,
      onSelect: () => {
        if (sha) context.openGraph(sha);
      },
    });
    for (const action of [
      "checkout",
      "push",
      "delete",
      "create_branch",
    ] satisfies GitTagAction[]) {
      actions.push({
        key: action,
        label: t(`git.tagActions.${action}`) + "…",
        disabled:
          context.busy ||
          (!sha && (action === "checkout" || action === "create_branch")),
        separatorBefore: action === "checkout" || action === "create_branch",
        danger: action === "delete",
        onSelect: () => context.request({ action, name, sha }),
      });
    }
  }
  if (onDetails)
    actions.push({
      key: "details",
      label: t("git.viewDetails"),
      separatorBefore: !!actions.length,
      onSelect: onDetails,
    });
  actions.push(
    ...copies.map((action, index) => ({
      ...action,
      separatorBefore: index === 0 && !!actions.length,
    })),
  );
  if (onExpandedChange)
    actions.push(
      {
        key: "collapse",
        label: t("git.tagActions.collapse"),
        separatorBefore: true,
        disabled: !expanded,
        onSelect: () => onExpandedChange(false),
      },
      {
        key: "expand",
        label: t("git.tagActions.expand"),
        disabled: expanded,
        onSelect: () => onExpandedChange(true),
      },
    );
  const refresh = onRefresh ?? context?.refresh;
  if (refresh)
    actions.push({
      key: "refresh",
      label: t("git.tagActions.refresh"),
      separatorBefore: true,
      disabled: context?.busy,
      onSelect: refresh,
    });
  return actions;
}
