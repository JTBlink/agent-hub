import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SkillDirectoryActions } from "./SkillDirectoryActions";
import { toast } from "sonner";
import { getSkillsDirectory, getBackupDirectory } from "../lib/tauri";
import { compactHomePath } from "../utils";
import { getErrorMessage } from "../lib/error";

export function SkillsDirectorySetting({
  backup = false,
}: {
  backup?: boolean;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState("");
  useEffect(() => {
    let active = true;
    (backup ? getBackupDirectory() : getSkillsDirectory())
      .then((value) => {
        if (active) setPath(value);
      })
      .catch((error: unknown) => {
        if (active) toast.error(getErrorMessage(error, t("common.error")));
      });
    return () => {
      active = false;
    };
  }, [t, backup]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-secondary">
          {t(backup ? "settings.backupDirectory" : "settings.skillsDirectory")}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          {t(
            backup
              ? "settings.backupDirectoryHint"
              : "settings.skillsDirectoryHint",
          )}
        </p>
        <code className="mt-1 block break-all text-[12px] text-secondary">
          {compactHomePath(path)}
        </code>
      </div>
      <SkillDirectoryActions path={path} />
    </div>
  );
}
