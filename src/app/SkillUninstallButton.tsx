import { useState } from "react";
import {
  previewUninstallSkill,
  unlinkSkill,
  uninstallSkill,
} from "../lib/backend";
import type { InstalledSkill } from "../lib/backend";
import { useLanguage } from "../lib/i18n";
import { useConfirm } from "./Modal";

function targetDirectory(skill: InstalledSkill) {
  return skill.path.replace(/[\\/]SKILL\.md(?:\.agent-hub-disabled)?$/, "");
}

export function SkillUninstallButton({
  skill,
  workspaceDirectory,
  onCompleted,
  onError,
}: {
  skill: InstalledSkill;
  workspaceDirectory?: string;
  onCompleted: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { confirm, ConfirmPortal } = useConfirm();
  const { t } = useLanguage();
  const sharedLink =
    skill.storageKind === "symlink" &&
    skill.realPath.replace(/\\/g, "/").includes("/.agents/skills/");
  if ((!skill.sourceTracked && !sharedLink) || skill.category === "system") {
    return null;
  }

  async function uninstall() {
    setBusy(true);
    try {
      const input = {
        targetDirectory: targetDirectory(skill),
        workspaceDirectory,
      };
      const preview =
        skill.storageKind === "symlink"
          ? undefined
          : await previewUninstallSkill(input);
      const filesToRemove = preview
        ? preview.files.map((file) =>
            !skill.enabled && file === "SKILL.md"
              ? "SKILL.md.agent-hub-disabled"
              : file,
          )
        : [];
      const confirmed = await confirm({
        tone: "danger",
        title: `${t("uninstallTitle")} · ${skill.displayName}`,
        description: (
          <div>
            <p>
              {skill.storageKind === "symlink"
                ? t("symlinkUninstallDescription")
                : t("managedUninstallDescription")}
            </p>
            {skill.storageKind === "symlink" ? (
              <p>
                {t("uninstallTarget")}：<code>{skill.path}</code>
              </p>
            ) : (
              <>
                <p>将删除以下文件（共 {filesToRemove.length + 1} 个）：</p>
                <ul className="skill-uninstall-file-list">
                  {filesToRemove.map((file) => (
                    <li key={file}>
                      <code>{file}</code>
                    </li>
                  ))}
                  <li>
                    <code>.agent-hub-managed.json</code>
                  </li>
                </ul>
              </>
            )}
          </div>
        ),
        confirmLabel: t("confirmUninstall"),
      });
      if (!confirmed) return;
      if (skill.storageKind === "symlink") await unlinkSkill(input);
      else await uninstallSkill(input);
      onCompleted();
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "卸载失败，安装目录未被删除。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {ConfirmPortal}
      <button
        className="button button-ghost skill-view-button"
        type="button"
        disabled={busy}
        onClick={() => void uninstall()}
      >
        {busy ? t("uninstalling") : t("uninstall")}
      </button>
    </>
  );
}
