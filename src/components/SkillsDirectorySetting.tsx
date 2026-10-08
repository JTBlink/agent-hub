import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { getSkillsDirectory } from "../lib/tauri";
import { compactHomePath } from "../utils";
import { getErrorMessage } from "../lib/error";

export function SkillsDirectorySetting() {
  const { t } = useTranslation();
  const [path, setPath] = useState("");
  useEffect(() => {
    let active = true;
    getSkillsDirectory()
      .then((value) => {
        if (active) setPath(value);
      })
      .catch((error: unknown) => {
        if (active) toast.error(getErrorMessage(error, t("common.error")));
      });
    return () => {
      active = false;
    };
  }, [t]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-secondary">
          {t("settings.skillsDirectory")}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          {t("settings.skillsDirectoryHint")}
        </p>
        <code className="mt-1 block break-all text-[12px] text-secondary">
          {compactHomePath(path)}
        </code>
      </div>
      <button
        type="button"
        disabled={!path}
        className="app-button-secondary text-[12px]"
        onClick={() => {
          openPath(path).catch((error: unknown) =>
            toast.error(getErrorMessage(error, t("common.error"))),
          );
        }}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {t("install.scan.openFolder")}
      </button>
    </div>
  );
}
