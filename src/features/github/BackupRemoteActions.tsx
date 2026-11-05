import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { GITHUB_OAUTH_CLIENT_ID } from "../../lib/distribution";
import type { GithubBackupRemoteActionsProps } from "../../integrations/github-backup/contracts";
export function GithubBackupRemoteActions({
  remoteUrl,
  authMethod,
  busy,
  onDisconnect,
}: GithubBackupRemoteActionsProps) {
  const { t } = useTranslation();
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [deleteRemoteConfirmOpen, setDeleteRemoteConfirmOpen] = useState(false);
  const match = remoteUrl.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/,
  );
  const githubRepoWebUrl = match ? `https://github.com/${match[1]}` : null;
  // §3.1 row 2: revoking is done on GitHub's side (a public device-flow app
  // has no client secret, so tokens cannot be revoked via API) — open the
  // right page and disconnect this machine.
  const handleRevokeAuthorization = async () => {
    setRevokeConfirmOpen(false);
    const oauthUrl = GITHUB_OAUTH_CLIENT_ID
      ? `https://github.com/settings/connections/applications/${GITHUB_OAUTH_CLIENT_ID}`
      : "https://github.com/settings/applications";
    const patUrl = "https://github.com/settings/tokens";
    if (authMethod === "pat") {
      openUrl(patUrl).catch(() => {});
    } else if (authMethod === "oauth") {
      openUrl(oauthUrl).catch(() => {});
    } else {
      // Connected before the method was recorded (or wired manually): the
      // credential could be either kind — open both pages so nothing stays
      // silently authorized.
      openUrl(oauthUrl).catch(() => {});
      openUrl(patUrl).catch(() => {});
    }
    await onDisconnect();
  };

  // §3.1 row 3: repo deletion needs the `delete_repo` scope our tokens
  // deliberately don't have — GitHub's own settings page (with its type-the-
  // repo-name confirmation) is the safe double-confirm path.
  const handleOpenDeleteRemote = async () => {
    setDeleteRemoteConfirmOpen(false);
    if (githubRepoWebUrl) {
      await openUrl(`${githubRepoWebUrl}/settings#danger-zone`).catch(() => {});
      toast.info(t("backup.disconnect.deleteRemoteOpened"), {
        duration: 12000,
      });
    }
  };

  if (!githubRepoWebUrl) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setRevokeConfirmOpen(true)}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-2.5 text-sm font-medium text-tertiary transition-colors hover:bg-surface-active disabled:opacity-50"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {t("backup.disconnect.revoke")}
      </button>
      <p className="mt-2 text-xs leading-4 text-faint">
        {authMethod === "pat"
          ? t("backup.disconnect.revokeHintPat")
          : authMethod === "oauth"
            ? t("backup.disconnect.revokeHintOauth")
            : t("backup.disconnect.revokeHintUnknown")}
      </p>
      <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5">
        <div className="text-sm font-medium text-red-700 dark:text-red-300">
          {t("backup.disconnect.deleteRemote")}
        </div>
        <p className="mt-1 text-xs leading-4 text-red-700/80 dark:text-red-300/80">
          {t("backup.disconnect.deleteRemoteDesc")}
        </p>
        <button
          type="button"
          onClick={() => setDeleteRemoteConfirmOpen(true)}
          className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg border border-red-500/50 px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
        >
          <ExternalLink className="h-3 w-3" />
          {t("backup.disconnect.deleteRemoteAction")}
        </button>
      </div>{" "}
      <ConfirmDialog
        open={revokeConfirmOpen}
        title={t("backup.disconnect.revokeConfirmTitle")}
        message={
          authMethod === "pat"
            ? t("backup.disconnect.revokeConfirmPat")
            : authMethod === "oauth"
              ? t("backup.disconnect.revokeConfirmOauth")
              : t("backup.disconnect.revokeConfirmUnknown")
        }
        tone="warning"
        confirmLabel={t("backup.disconnect.revoke")}
        onClose={() => setRevokeConfirmOpen(false)}
        onConfirm={handleRevokeAuthorization}
      />
      <ConfirmDialog
        open={deleteRemoteConfirmOpen}
        title={t("backup.disconnect.deleteRemoteAction")}
        message={t("backup.disconnect.deleteRemoteConfirm")}
        confirmLabel={t("backup.disconnect.deleteRemoteAction")}
        onClose={() => setDeleteRemoteConfirmOpen(false)}
        onConfirm={handleOpenDeleteRemote}
      />
    </>
  );
}
