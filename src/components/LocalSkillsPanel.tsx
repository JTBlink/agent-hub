import { useMemo, useState } from "react";
import {
  Calendar,
  Check,
  ChevronRight,
  DownloadCloud,
  FolderSearch,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, compactHomePath } from "../utils";
import type { ScanResult } from "../lib/tauri";
import {
  discoveredGroupKey,
  discoveredSkillCounts,
  filterDiscoveredGroups,
  uniqueDiscoveredLocations,
} from "../lib/localSkillScan";
import { ConfirmDialog } from "./ConfirmDialog";
import { DetailSheet } from "./DetailSheet";
import { SkillMarkdown } from "./SkillMarkdown";
import { LocalSkillCleanup } from "./LocalSkillCleanup";
import { LocalSkillLocation } from "./LocalSkillLocation";
import { useLocalSkillManagement } from "../hooks/useLocalSkillManagement";

interface Props {
  scanResult: ScanResult | null;
  scanLoading: boolean;
  importingPaths: Set<string>;
  importingAll: boolean;
  runScan: () => Promise<void>;
  onChanged: () => Promise<void>;
  handleImportDiscovered: (sourcePath: string, name: string) => Promise<void>;
  handleImportAllDiscovered: () => Promise<void>;
}

export function LocalSkillsPanel({
  scanResult,
  scanLoading,
  importingPaths,
  importingAll,
  runScan,
  onChanged,
  handleImportDiscovered,
  handleImportAllDiscovered,
}: Props) {
  const { t } = useTranslation();
  const [renameEditing, setRenameEditing] = useState<Record<string, string>>(
    {},
  );
  const [query, setQuery] = useState("");
  const {
    detail,
    content,
    documentError,
    documentLoading,
    deleteTarget,
    busy,
    viewLocation,
    setDeleteTarget,
    removeLocation,
    closeDetail,
    closeDelete,
  } = useLocalSkillManagement(runScan, onChanged);
  const scanGroups = useMemo(
    () => uniqueDiscoveredLocations(scanResult?.groups ?? []),
    [scanResult],
  );
  const pendingGroups = scanGroups.filter((group) => !group.imported);
  const counts = discoveredSkillCounts(scanGroups);
  const visibleGroups = useMemo(
    () => filterDiscoveredGroups(scanGroups, query),
    [scanGroups, query],
  );
  return (
    <>
      <section className="app-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle px-4 py-3.5">
          <div>
            <h2 className="text-[13px] font-semibold text-secondary">
              {t("install.scan.title")}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {scanResult
                ? t("install.scan.summary", counts)
                : t("install.scan.initial")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LocalSkillCleanup
              disabled={scanLoading || importingAll || busy}
              runScan={runScan}
              onChanged={onChanged}
            />
            <button
              onClick={runScan}
              disabled={scanLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-active disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", scanLoading && "animate-spin")}
              />
              {t("install.scan.rescan")}
            </button>
            <button
              onClick={handleImportAllDiscovered}
              disabled={
                scanLoading || importingAll || pendingGroups.length === 0
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-border bg-accent-dark px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
            >
              {importingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadCloud className="h-3.5 w-3.5" />
              )}
              {t("install.scan.importAll")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border-subtle px-4 py-3">
          <input
            aria-label={t("install.scan.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("install.scan.search")}
            className="app-input min-w-0 flex-1"
          />
        </div>
        <div className="space-y-4 p-4">
          {scanLoading ? (
            <div className="flex items-center justify-center gap-2.5 py-12 text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">{t("install.scan.scanning")}</span>
            </div>
          ) : scanResult && visibleGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-hover">
                <FolderSearch className="h-5 w-5 text-muted" />
              </div>
              <h3 className="mb-1 text-[13px] font-semibold text-tertiary">
                {t("install.scan.noResults")}
              </h3>
              <p className="text-[13px] text-muted">
                {t("install.scan.noResultsHint")}
              </p>
            </div>
          ) : (
            <>
              <div className="app-panel-muted overflow-hidden">
                {visibleGroups.map((group) => {
                  const groupKey = discoveredGroupKey(group);
                  const [primaryLocation, ...otherLocations] = group.locations;
                  const primaryPath = primaryLocation?.found_path;
                  const isImporting =
                    !!primaryPath && importingPaths.has(primaryPath);
                  const isRenaming = groupKey in renameEditing;
                  const importName = renameEditing[groupKey] ?? group.name;
                  const foundDate = new Date(group.found_at).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    },
                  );

                  return (
                    <article
                      key={groupKey}
                      className="border-b border-border-subtle last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            {isRenaming ? (
                              <input
                                autoFocus
                                value={renameEditing[groupKey]}
                                onChange={(e) =>
                                  setRenameEditing((prev) => ({
                                    ...prev,
                                    [groupKey]: e.target.value,
                                  }))
                                }
                                onBlur={() => {
                                  if (!renameEditing[groupKey]?.trim()) {
                                    setRenameEditing((prev) => {
                                      const next = { ...prev };
                                      delete next[groupKey];
                                      return next;
                                    });
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setRenameEditing((prev) => {
                                      const next = { ...prev };
                                      delete next[groupKey];
                                      return next;
                                    });
                                  } else if (e.key === "Enter") {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                className="min-w-0 max-w-[220px] rounded border border-accent-border bg-surface px-1.5 py-0.5 text-[13px] font-semibold text-secondary outline-none focus:ring-1 focus:ring-accent"
                              />
                            ) : (
                              <h3 className="truncate text-[13px] font-semibold text-secondary">
                                {group.name}
                              </h3>
                            )}
                            {!group.imported && !isRenaming ? (
                              <button
                                onClick={() =>
                                  setRenameEditing((prev) => ({
                                    ...prev,
                                    [groupKey]: group.name,
                                  }))
                                }
                                className="shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
                                title={t("install.scan.rename")}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            ) : null}
                            {group.imported ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[13px] font-semibold text-emerald-400">
                                <Check className="h-3 w-3" />
                                {t("install.scan.imported")}
                              </span>
                            ) : null}
                            <span className="shrink-0 rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[13px] text-muted">
                              {t("install.scan.locations", {
                                count: group.locations.length,
                              })}
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
                              <Calendar className="h-3 w-3" />
                              {foundDate}
                            </span>
                          </div>

                          {primaryLocation && (
                            <LocalSkillLocation
                              name={group.name}
                              location={primaryLocation}
                              busy={busy}
                              onView={viewLocation}
                              onDelete={setDeleteTarget}
                            />
                          )}
                        </div>

                        <div className="flex shrink-0 items-start justify-end">
                          {group.imported ? null : (
                            <button
                              onClick={() =>
                                primaryPath &&
                                handleImportDiscovered(primaryPath, importName)
                              }
                              disabled={!primaryPath || isImporting}
                              className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-accent-border bg-accent-dark px-2.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
                            >
                              {isImporting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <DownloadCloud className="h-3 w-3" />
                              )}
                              {t("install.scan.importOne")}
                            </button>
                          )}
                        </div>
                      </div>

                      {otherLocations.length > 0 ? (
                        <details className="group border-t border-border-subtle bg-surface/40 px-3 py-1.5">
                          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded py-1 text-[12px] text-muted hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                            {t("install.scan.otherLocations", {
                              count: otherLocations.length,
                            })}
                          </summary>
                          <div className="space-y-1 pt-1">
                            {otherLocations.map((location) => (
                              <LocalSkillLocation
                                key={location.id}
                                name={group.name}
                                location={location}
                                busy={busy}
                                onView={viewLocation}
                                onDelete={setDeleteTarget}
                              />
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
      <DetailSheet
        open={!!detail}
        title={detail?.name ?? ""}
        description={detail ? compactHomePath(detail.location.found_path) : ""}
        onClose={closeDetail}
      >
        {documentLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        ) : documentError ? (
          <p role="alert" className="text-red-400">
            {documentError}
          </p>
        ) : (
          <SkillMarkdown content={content ?? ""} />
        )}
      </DetailSheet>
      <ConfirmDialog
        open={!!deleteTarget}
        title={t("globalWorkspace.localSkills.deleteLocalConfirmTitle")}
        message={t("install.scan.deleteConfirmMessage", {
          name: deleteTarget?.name ?? "",
        })}
        details={
          deleteTarget
            ? [
                compactHomePath(deleteTarget.location.found_path),
                t("install.scan.deleteHint"),
              ]
            : []
        }
        onClose={closeDelete}
        onConfirm={removeLocation}
      />
    </>
  );
}
