import { FolderOpen, Loader2, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAgentSettings } from "../../hooks/useAgentSettings";
import { actionButtonClass, fieldClass } from "./settingsStyles";

export function AddCustomAgentForm({
  controller,
}: {
  controller: ReturnType<typeof useAgentSettings>;
}) {
  const { t } = useTranslation();
  const {
    setShowAddCustom,
    customName,
    setCustomName,
    customPath,
    setCustomPath,
    customProjectPath,
    setCustomProjectPath,
    addingCustom,
    handleBrowsePath,
    handleAddCustomAgent,
  } = controller;
  return (
    <div className="app-panel p-4 mb-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-secondary">
          {t("settings.addCustomAgent")}
        </h3>
        <button
          aria-label={t("common.cancel")}
          onClick={() => setShowAddCustom(false)}
          className="text-muted hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div>
        <label className="text-[12px] text-muted mb-1 block">
          {t("settings.agentName")}
        </label>
        <input
          type="text"
          aria-label={t("settings.agentName")}
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder={t("settings.agentNamePlaceholder")}
          className={`${fieldClass} w-full`}
        />
      </div>
      <div>
        <label className="text-[12px] text-muted mb-1 block">
          {t("settings.skillsPath")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label={t("settings.skillsPath")}
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder={t("settings.skillsPathPlaceholder")}
            className={`${fieldClass} min-w-0 flex-1 font-mono`}
          />
          <button
            onClick={() => handleBrowsePath(setCustomPath)}
            className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
          >
            <FolderOpen className="w-3 h-3" />
            {t("settings.selectFolder")}
          </button>
        </div>
      </div>
      <div>
        <label className="text-[12px] text-muted mb-1 block">
          {t("settings.projectSkillsPath")}
        </label>
        <input
          type="text"
          aria-label={t("settings.projectSkillsPath")}
          value={customProjectPath}
          onChange={(e) => setCustomProjectPath(e.target.value)}
          placeholder={t("settings.projectSkillsPathPlaceholder")}
          className={`${fieldClass} w-full font-mono`}
        />
        <p className="mt-1 text-[12px] text-muted">
          {t("settings.projectSkillsPathDesc")}
        </p>
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleAddCustomAgent}
          disabled={addingCustom || !customName.trim() || !customPath.trim()}
          className={`${actionButtonClass} bg-accent text-white border-accent hover:opacity-90 disabled:opacity-50`}
        >
          {addingCustom ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
          {t("settings.addAgent")}
        </button>
      </div>
    </div>
  );
}
