import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { compareDeclaredSkillVersions } from "../lib/skillVersions";

export function GitSkillVersionInfo({
  repositoryVersion,
  installedVersion,
  installed,
  confirmOverwrite = false,
}: {
  repositoryVersion: string | null | undefined;
  installedVersion?: string | null;
  installed: boolean;
  confirmOverwrite?: boolean;
}) {
  const { t } = useTranslation();
  const comparison = compareDeclaredSkillVersions(
    installedVersion,
    repositoryVersion,
  );
  const unknown = t("install.gitBrowser.versionNotDeclared");
  return (
    <div className="space-y-1 text-[12px] leading-5">
      <p className="break-words text-muted">
        {repositoryVersion === undefined
          ? t("install.gitBrowser.versionRefreshNeeded")
          : t("install.gitBrowser.repositoryVersion", {
              version: repositoryVersion || unknown,
            })}
        {installed && (
          <>
            {" "}
            ·{" "}
            {t("install.gitBrowser.installedVersion", {
              version: installedVersion || unknown,
            })}
          </>
        )}
      </p>
      {installed && comparison === "central_newer" && (
        <p
          className="flex items-start gap-1 font-medium text-danger"
          role={confirmOverwrite ? "alert" : undefined}
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          {confirmOverwrite
            ? t("install.gitBrowser.downgradeWarning", {
                installed: installedVersion,
                repository: repositoryVersion,
              })
            : t("install.gitBrowser.repositoryOlder")}
        </p>
      )}
      {installed && comparison === "source_newer" && (
        <p className="font-medium text-accent-light">
          {t("install.gitBrowser.repositoryNewer")}
        </p>
      )}
    </div>
  );
}
