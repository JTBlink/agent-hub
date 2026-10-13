import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsForm } from "./SettingsForm";
import {
  Check,
  ExternalLink,
  Folder,
  FolderOpen,
  Loader2,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../../lib/tauri";
import { cn, compactHomePath } from "../../utils";
import { actionButtonClass, fieldClass } from "./settingsStyles";

export function AppDataDirectorySetting() {
  const { t } = useTranslation();
  const handleBrowsePath = async (setter: (path: string) => void) => {
    try {
      const selected = await api.pickDirectory();
      if (selected) setter(selected);
    } catch {
      toast.error(t("common.error"));
    }
  };
  const [openingRepo, setOpeningRepo] = useState(false);
  const [centralRepoPath, setCentralRepoPath] = useState("");
  const [centralRepoPathOverride, setCentralRepoPathOverride] = useState<
    string | null
  >(null);
  const [centralRepoPendingPath, setCentralRepoPendingPath] = useState<
    string | null
  >(null);
  const [editingCentralRepoPath, setEditingCentralRepoPath] = useState(false);
  const [centralRepoPathInput, setCentralRepoPathInput] = useState("");
  const [savingCentralRepoPath, setSavingCentralRepoPath] = useState(false);
  const form = useSettingsForm(
    () =>
      Promise.all([
        api.getCentralRepoPath(),
        api.getCentralRepoPathOverride(),
        api.getCentralRepoPendingPath(),
      ]),
    ([path, override, pending]) => {
      setCentralRepoPath(path);
      setCentralRepoPathInput(path);
      setCentralRepoPathOverride(override);
      setCentralRepoPendingPath(pending);
    },
  );
  const handleOpenRepoInFinder = async () => {
    try {
      setOpeningRepo(true);
      await api.openCentralRepoFolder();
    } catch (error) {
      console.error("Failed to open central repository folder", error);
      toast.error(t("common.error"));
    } finally {
      setOpeningRepo(false);
    }
  };

  const handleStartEditCentralRepoPath = () => {
    setCentralRepoPathInput(centralRepoPathOverride ?? centralRepoPath);
    setEditingCentralRepoPath(true);
  };

  const handleSaveCentralRepoPath = async () => {
    const trimmed = centralRepoPathInput.trim();
    if (!trimmed) {
      toast.error(t("settings.repoPathEmpty"));
      return;
    }
    setSavingCentralRepoPath(true);
    try {
      // The running session keeps using the current library; the move
      // happens at the next launch.
      const nextPath = await api.setCentralRepoPath(trimmed);
      setCentralRepoPathOverride(nextPath);
      const pending = await api.getCentralRepoPendingPath();
      setCentralRepoPendingPath(pending);
      setEditingCentralRepoPath(false);
      toast.success(t("settings.repoPathSaved"));
      if (pending) toast.info(t("settings.repoPathRestartNotice"));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSavingCentralRepoPath(false);
    }
  };

  const handleResetCentralRepoPath = async () => {
    setSavingCentralRepoPath(true);
    try {
      const nextPath = await api.setCentralRepoPath(null);
      setCentralRepoPathOverride(null);
      setCentralRepoPathInput(nextPath);
      const pending = await api.getCentralRepoPendingPath();
      setCentralRepoPendingPath(pending);
      setEditingCentralRepoPath(false);
      toast.success(t("settings.repoPathReset"));
      if (pending) toast.info(t("settings.repoPathRestartNotice"));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSavingCentralRepoPath(false);
    }
  };

  const displayedRepoPath = centralRepoPath
    ? compactHomePath(centralRepoPath)
    : t("common.loading");

  return (
    <SettingsForm form={form}>
      <section>
        <h2 className="app-section-title mb-3">{t("settings.repoPath")}</h2>
        <div className="app-panel">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-primary">
                {t("settings.repoPath")}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                {t("settings.repoPathDesc")}
              </p>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-2">
              {editingCentralRepoPath ? (
                <div className="flex min-w-[320px] max-w-full items-center gap-1">
                  <input
                    type="text"
                    aria-label={t("settings.repoPath")}
                    value={centralRepoPathInput}
                    onChange={(e) => setCentralRepoPathInput(e.target.value)}
                    className={`${fieldClass} min-w-0 flex-1 font-mono`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        void form.save(handleSaveCentralRepoPath);
                      if (e.key === "Escape") {
                        setCentralRepoPathInput(
                          centralRepoPathOverride ?? centralRepoPath,
                        );
                        setEditingCentralRepoPath(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleBrowsePath(setCentralRepoPathInput)}
                    disabled={savingCentralRepoPath}
                    className={`${actionButtonClass} text-muted hover:text-secondary`}
                  >
                    <FolderOpen className="w-3 h-3" />
                    {t("settings.selectFolder")}
                  </button>
                  <button
                    aria-label={t("common.save")}
                    type="button"
                    onClick={() => void form.save(handleSaveCentralRepoPath)}
                    disabled={savingCentralRepoPath}
                    className={`${actionButtonClass} border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/5 dark:text-emerald-400`}
                  >
                    {savingCentralRepoPath ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    {t("common.save")}
                  </button>
                  <button
                    aria-label={t("common.cancel")}
                    type="button"
                    onClick={() => {
                      setCentralRepoPathInput(
                        centralRepoPathOverride ?? centralRepoPath,
                      );
                      setEditingCentralRepoPath(false);
                    }}
                    disabled={savingCentralRepoPath}
                    className={`${actionButtonClass} text-muted hover:text-secondary`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-background px-3 py-2">
                  <Folder className="w-3 h-3 text-muted" />
                  <span className="truncate text-[13px] font-mono text-tertiary">
                    {displayedRepoPath}
                  </span>
                </div>
              )}
              {!editingCentralRepoPath && (
                <button
                  type="button"
                  onClick={handleStartEditCentralRepoPath}
                  className={`${actionButtonClass} text-muted hover:text-secondary`}
                >
                  <Pencil className="w-3 h-3" />
                  {t("settings.changeDir")}
                </button>
              )}
              {!editingCentralRepoPath && centralRepoPathOverride && (
                <button
                  type="button"
                  onClick={() => void form.save(handleResetCentralRepoPath)}
                  disabled={savingCentralRepoPath}
                  className={`${actionButtonClass} text-muted hover:text-secondary`}
                >
                  {savingCentralRepoPath ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  {t("settings.resetPath")}
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenRepoInFinder}
                disabled={openingRepo}
                className={cn(
                  actionButtonClass,
                  "border-accent-border bg-accent-bg text-accent",
                  "hover:border-accent hover:bg-accent-bg",
                  openingRepo && "cursor-wait opacity-70",
                )}
              >
                {openingRepo ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ExternalLink className="w-3 h-3" />
                )}
                {t("settings.openInFinder")}
              </button>
            </div>
            <div className="w-full text-[12px] text-muted">
              {centralRepoPendingPath ? (
                <span className="text-amber-600 dark:text-amber-400">
                  {t("settings.repoPathPendingHint", {
                    path: compactHomePath(centralRepoPendingPath),
                  })}
                </span>
              ) : centralRepoPathOverride ? (
                t("settings.repoPathCustomHint")
              ) : (
                t("settings.repoPathDefaultHint")
              )}
            </div>
          </div>
        </div>
      </section>
    </SettingsForm>
  );
}
