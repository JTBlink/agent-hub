import { Check, DownloadCloud, Github, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import type { GitPreviewResult, ManagedSkill } from "../lib/tauri";

export interface GitSelection {
  rel_path: string;
  name: string;
  description: string | null;
  selected: boolean;
}

interface GitImportPanelProps {
  gitUrl: string;
  setGitUrl: (url: string) => void;
  gitLoading: boolean;
  gitCancelKey: string | null;
  gitPreview: GitPreviewResult | null;
  gitSelections: GitSelection[];
  setGitSelections: React.Dispatch<React.SetStateAction<GitSelection[]>>;
  gitConfirmLoading: boolean;
  findInstalledByGitUrl: (url: string) => ManagedSkill | undefined;
  onPreview: () => void;
  onPreviewClose: () => void;
  onConfirm: () => void;
  onCancelInstall: (key: string) => void;
}

export function GitImportPanel({
  gitUrl,
  setGitUrl,
  gitLoading,
  gitCancelKey,
  gitPreview,
  gitSelections,
  setGitSelections,
  gitConfirmLoading,
  findInstalledByGitUrl,
  onPreview,
  onPreviewClose,
  onConfirm,
  onCancelInstall,
}: GitImportPanelProps) {
  const { t } = useTranslation();
  const installed = gitUrl.trim() ? findInstalledByGitUrl(gitUrl) : undefined;

  return (
    <>
      <div className="animate-in fade-in duration-300">
        <div className="app-panel max-w-lg p-5">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-hover">
            <Github className="h-5 w-5 text-tertiary" />
          </div>
          <h2 className="mb-1 text-[14px] font-semibold text-primary">
            {t("install.gitTitle")}
          </h2>
          <p className="mb-4 text-[13px] text-muted">{t("install.gitDesc")}</p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-tertiary">
                {t("install.repoUrl")}
              </label>
              <input
                type="text"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !gitLoading && gitUrl.trim())
                    onPreview();
                }}
                placeholder={t("install.repoUrlPlaceholder")}
                disabled={gitLoading}
                className="app-input w-full bg-background"
              />
            </div>
            {installed && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-400">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t("install.gitAlreadyInstalled", {
                    name: installed.name,
                  })}
                </span>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {gitLoading ? (
                <button
                  onClick={() => gitCancelKey && onCancelInstall(gitCancelKey)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                  disabled={!gitCancelKey}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("install.cancel")}
                </button>
              ) : (
                <button
                  onClick={onPreview}
                  disabled={!gitUrl.trim()}
                  className={cn(
                    "flex w-full",
                    installed
                      ? "app-button-secondary bg-background"
                      : "app-button-primary",
                  )}
                >
                  <DownloadCloud className="h-3.5 w-3.5" />
                  {installed
                    ? t("install.gitReinstall")
                    : t("install.installClone")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {gitPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onPreviewClose}
          />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-primary">
                {t("install.gitPreview.title")}
              </h2>
              <button
                onClick={onPreviewClose}
                disabled={gitConfirmLoading}
                className="rounded p-1 text-muted transition-colors hover:text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-[13px] text-muted">
              {t("install.gitPreview.description")}
            </p>

            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setGitSelections((prev) =>
                    prev.map((s) => ({ ...s, selected: true })),
                  )
                }
                disabled={gitConfirmLoading}
                className="text-[13px] text-accent-light hover:underline"
              >
                {t("install.gitPreview.selectAll")}
              </button>
              <span className="text-faint">&middot;</span>
              <button
                type="button"
                onClick={() =>
                  setGitSelections((prev) =>
                    prev.map((s) => ({ ...s, selected: false })),
                  )
                }
                disabled={gitConfirmLoading}
                className="text-[13px] text-muted hover:underline"
              >
                {t("install.gitPreview.deselectAll")}
              </button>
            </div>

            {gitSelections.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">
                {t("install.gitPreview.empty")}
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-hide pr-1">
                {gitSelections.map((item, idx) => (
                  <div
                    key={item.rel_path}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                      item.selected
                        ? "border-accent-border bg-accent-bg/40"
                        : "border-border-subtle bg-background opacity-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      disabled={gitConfirmLoading}
                      onChange={(e) =>
                        setGitSelections((prev) =>
                          prev.map((s, i) =>
                            i === idx
                              ? { ...s, selected: e.target.checked }
                              : s,
                          ),
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          setGitSelections((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, name: e.target.value } : s,
                            ),
                          )
                        }
                        disabled={!item.selected || gitConfirmLoading}
                        placeholder={t("install.gitPreview.namePlaceholder")}
                        className="app-input w-full bg-background py-1 text-[13px]"
                      />
                      {item.description ? (
                        <p className="mt-1 truncate text-[12px] text-muted">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onPreviewClose}
                disabled={gitConfirmLoading}
                className="px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-secondary"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={
                  gitConfirmLoading || gitSelections.every((s) => !s.selected)
                }
                className="app-button-primary"
              >
                {gitConfirmLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <DownloadCloud className="h-3.5 w-3.5" />
                )}
                {t("install.gitPreview.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
