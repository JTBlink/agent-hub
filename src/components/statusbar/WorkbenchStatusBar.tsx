import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { AgentUsageStatusBar } from "../usage/AgentUsageStatusBar";
import { SystemLoadStatus } from "./SystemLoadStatus";

/** Owns the footer layout; workspace-specific status is rendered into its slots. */
export function WorkbenchStatusBar({
  branchRef,
  statusRef,
}: {
  branchRef: Ref<HTMLDivElement>;
  statusRef: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  return (
    <footer className="workbench-statusbar flex shrink-0 items-center gap-3 bg-bg-secondary px-2 text-xs text-muted">
      <div
        ref={branchRef}
        className="workbench-branch-content h-full min-w-0 shrink-0"
      />
      <div
        ref={statusRef}
        className="workbench-status-content flex min-w-0 flex-1 items-center"
      />
      <span className="workbench-status-fallback truncate">
        {t("app.name")}
      </span>
      <div className="ml-auto flex h-full shrink-0 items-center gap-3">
        <AgentUsageStatusBar />
        <SystemLoadStatus />
      </div>
    </footer>
  );
}
