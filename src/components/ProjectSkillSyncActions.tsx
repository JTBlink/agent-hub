import { Download, Loader2, RotateCcw, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectSkill } from "../lib/tauri";
import { cn } from "../utils";

/** Shared sync controls for cards, list rows and the detail heading. */
export function ProjectSkillSyncActions({
  status,
  updatingCenter,
  updatingProject,
  onUpdateCenter,
  onUpdateProject,
  variant = "card",
}: {
  status: ProjectSkill["sync_status"];
  updatingCenter: boolean;
  updatingProject: boolean;
  onUpdateCenter: () => void;
  onUpdateProject: () => void;
  variant?: "card" | "list";
}) {
  const { t } = useTranslation();
  const canUpload = ["project_only", "project_newer", "diverged"].includes(
    status,
  );
  const canPull = ["project_newer", "center_newer", "diverged"].includes(
    status,
  );
  if (!canUpload && !canPull) return null;
  const busy = updatingCenter || updatingProject;
  const highlightUpload =
    status === "project_newer" || status === "project_only";
  const highlightedClass = "bg-accent-bg text-accent-light";
  const secondaryClass = "text-muted hover:text-secondary";
  const pullLabel = t(
    status === "project_newer"
      ? "project.resetFromCenter"
      : "project.updateProject",
  );
  const buttonClass =
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:cursor-wait disabled:opacity-50";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5",
        variant === "card" &&
          "rounded-lg border border-border-subtle bg-surface-hover p-0.5",
      )}
    >
      {canUpload && (
        <button
          type="button"
          aria-label={t("project.updateCenter")}
          title={t("project.updateCenter")}
          disabled={busy}
          className={cn(
            buttonClass,
            highlightUpload ? highlightedClass : secondaryClass,
          )}
          onClick={(event) => {
            event.stopPropagation();
            onUpdateCenter();
          }}
        >
          {updatingCenter ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      {canPull && (
        <button
          type="button"
          aria-label={pullLabel}
          title={pullLabel}
          disabled={busy}
          className={cn(
            buttonClass,
            highlightUpload ? secondaryClass : highlightedClass,
          )}
          onClick={(event) => {
            event.stopPropagation();
            onUpdateProject();
          }}
        >
          {updatingProject ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : status === "project_newer" ? (
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
