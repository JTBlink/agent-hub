import { Code2, FolderOpen } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import { openDirectoryInVscode } from "../lib/openInVscode";

export function SkillDirectoryActions({
  path,
  disabled = false,
  compact = false,
}: {
  path: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const open = async (editor: boolean) => {
    try {
      if (editor) await openDirectoryInVscode(path);
      else await openPath(path);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    }
  };
  return (
    <div
      className={
        compact
          ? "flex shrink-0 items-center gap-1"
          : "flex flex-wrap items-center gap-1"
      }
    >
      <button
        type="button"
        disabled={disabled || !path}
        onClick={() => void open(false)}
        title={t("install.scan.openFolder")}
        aria-label={t("install.scan.openFolder")}
        className={
          compact
            ? "rounded p-0.5 text-faint transition-colors hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent"
            : "app-button-secondary !px-2 !py-1 text-[12px] focus-visible:ring-2 focus-visible:ring-accent"
        }
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {!compact && t("install.scan.openFolder")}
      </button>
      <button
        type="button"
        disabled={disabled || !path}
        onClick={() => void open(true)}
        title={t("install.scan.openInVscode")}
        aria-label={t("install.scan.openInVscode")}
        className={
          compact
            ? "rounded p-0.5 text-faint transition-colors hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent"
            : "app-button-secondary !px-2 !py-1 text-[12px] focus-visible:ring-2 focus-visible:ring-accent"
        }
      >
        <Code2 className="h-3.5 w-3.5" />
        {!compact && t("install.scan.openInVscode")}
      </button>
    </div>
  );
}
