import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import type { ProjectLibraryStatus } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

type SharingFiles = Pick<
  ProjectLibraryStatus,
  "files_to_commit" | "management_files" | "ignored_paths"
>;

/** Skill delivery uses native files; management metadata is optional for teams. */
export function ProjectSharingFiles({ status }: { status: SharingFiles }) {
  const { t } = useTranslation();
  const management = new Set(status.management_files);
  const shared = status.files_to_commit.filter((path) => !management.has(path));
  const ignored = status.ignored_paths.filter((path) => !management.has(path));
  const managementIgnored = status.ignored_paths.some((path) =>
    management.has(path),
  );
  const copyPaths = async () => {
    try {
      await writeText(shared.join("\n"));
      toast.success(t("projectLibrary.pathsCopied"));
    } catch (reason) {
      toast.error(getErrorMessage(reason, t("common.error")));
    }
  };

  return (
    <>
      {shared.length > 0 && (
        <section className="mt-3">
          <h4 className="font-medium text-secondary">
            {t("projectLibrary.commitFiles", { count: shared.length })}
          </h4>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono [overflow-wrap:anywhere]">
            {shared.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void copyPaths()}
            className="mt-2 inline-flex items-center gap-1 text-accent-light focus-visible:outline focus-visible:outline-2"
          >
            <Copy className="h-3 w-3" />
            {t("projectLibrary.copyPaths")}
          </button>
        </section>
      )}
      {ignored.length > 0 && (
        <div role="alert" className="mt-2 text-amber-600 dark:text-amber-400">
          <p>{t("projectLibrary.ignored", { count: ignored.length })}</p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono [overflow-wrap:anywhere]">
            {ignored.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
          <p className="mt-2">{t("projectLibrary.ignoredHelp")}</p>
        </div>
      )}
      {status.management_files.length > 0 && (
        <section className="mt-3">
          <h4 className="font-medium text-secondary">
            {t("projectLibrary.managementFiles")}
          </h4>
          <p className="mt-2">{t("projectLibrary.managementHelp")}</p>
          <ul className="mt-2 space-y-1 font-mono [overflow-wrap:anywhere]">
            {status.management_files.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
          {managementIgnored && (
            <p className="mt-2">{t("projectLibrary.managementIgnored")}</p>
          )}
        </section>
      )}
    </>
  );
}
