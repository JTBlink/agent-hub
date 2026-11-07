import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";
import { useGitTagActions } from "./useGitTagActions";

export function GitTagMenu({
  contextTarget,
  contextOnly,
  className,
  ...options
}: Parameters<typeof useGitTagActions>[0] & {
  contextTarget: RefObject<HTMLElement | null>;
  contextOnly?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const actions = useGitTagActions(options);
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
