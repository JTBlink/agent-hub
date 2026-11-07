import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { AppDialog } from "./AppDialog";

/** Preserve the Git browser's existing accessible close action. */
export function GitBrowserDialog(props: ComponentProps<typeof AppDialog>) {
  const { t } = useTranslation();
  return <AppDialog {...props} closeLabel={t("install.gitBrowser.close")} />;
}
