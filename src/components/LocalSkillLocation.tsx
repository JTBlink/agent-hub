import { FileText, Link2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { compactHomePath } from "../utils";
import { SkillDirectoryActions } from "./SkillDirectoryActions";
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
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {location.is_symlink && (
            <span
              role="img"
              aria-label={t("install.scan.symlink")}
              title={t("install.scan.symlink")}
              className="mt-0.5 shrink-0 text-accent"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
          <code className="min-w-0 break-all text-[12px] text-muted">
            {compactHomePath(location.found_path)}
          </code>
        </div>
        {location.resolved_path && (
          <div className="mt-1 min-w-0 break-all pl-5 text-[11px] text-tertiary">
            {t("install.scan.resolvedPath", {
              path: compactHomePath(location.resolved_path),
            })}
          </div>
        )}
        <div
          className="mt-1 flex flex-wrap items-center gap-1"
          title={t("install.scan.applicableAgentsHint")}
        >
          <span className="mr-0.5 text-[11px] text-muted">
            {t("install.scan.applicableAgents")}
          </span>
          {location.tools.map((tool) => (
            <span
              key={tool}
              className="rounded border border-border-subtle bg-surface px-1.5 py-px text-[11px] text-tertiary"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>
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
        <SkillDirectoryActions path={location.found_path} disabled={busy} />
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(selection)}
          aria-label={t("install.scan.deleteLocation", {
            name,
            path: compactHomePath(location.found_path),
          })}
          className="rounded p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
