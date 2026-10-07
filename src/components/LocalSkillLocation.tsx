import { FileText, FolderOpen, Trash2 } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { compactHomePath } from "../utils";
import { getErrorMessage } from "../lib/error";
import type { LocalSkillSelection } from "../lib/localSkillScan";

export function LocalSkillLocation({
  name,
  location,
  busy,
  onView,
  onDelete,
}: {
  name: string;
  location: LocalSkillSelection["location"];
  busy: boolean;
  onView: (selection: LocalSkillSelection) => Promise<void>;
  onDelete: (selection: LocalSkillSelection) => void;
}) {
  const { t } = useTranslation();
  const selection = { name, location };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="rounded border border-border-subtle bg-surface px-1.5 py-px text-[12px] text-tertiary">
        {location.tool}
      </span>
      <code className="min-w-0 flex-1 break-all text-[12px] text-muted">
        {compactHomePath(location.found_path)}
      </code>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onView(selection)}
          className="app-button-secondary !px-2 !py-1 text-[12px] focus-visible:ring-2 focus-visible:ring-accent"
        >
          <FileText className="h-3.5 w-3.5" />
          {t("install.scan.viewContent")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            openPath(location.found_path).catch((error: unknown) =>
              toast.error(getErrorMessage(error, t("common.error"))),
            );
          }}
          className="app-button-secondary !px-2 !py-1 text-[12px] focus-visible:ring-2 focus-visible:ring-accent"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t("install.scan.openFolder")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(selection)}
          aria-label={t("install.scan.deleteLocation", {
            name,
            agent: location.tool,
          })}
          className="rounded p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
