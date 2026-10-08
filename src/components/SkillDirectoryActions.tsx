import { Code2, FolderOpen } from "lucide-react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import { vscodeDirectoryUrl } from "../lib/skillDirectory";

export function SkillDirectoryActions({
  path,
  disabled = false,
}: {
  path: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const open = async (editor: boolean) => {
    try {
      if (editor) await openUrl(vscodeDirectoryUrl(path));
      else await openPath(path);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        disabled={disabled || !path}
        onClick={() => void open(false)}
        className="app-button-secondary !px-2 !py-1 text-[12px] focus-visible:ring-2 focus-visible:ring-accent"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {t("install.scan.openFolder")}
      </button>
      <button
        type="button"
        disabled={disabled || !path}
        onClick={() => void open(true)}
        className="app-button-secondary !px-2 !py-1 text-[12px] focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Code2 className="h-3.5 w-3.5" />
        {t("install.scan.openInVscode")}
      </button>
    </div>
  );
}
