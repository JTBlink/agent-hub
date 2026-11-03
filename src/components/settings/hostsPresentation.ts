import type { TFunction } from "i18next";
import { getErrorMessage } from "../../lib/error";
import type { HostsProfile, HostsSnapshot } from "../../lib/hostsApi";

export const hostsEditorText = (content: string) =>
  content.replace(/\r\n/g, "\n");

export function hostsDisplayPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const filename = parts.at(-1) ?? "";
  const shortName = filename.replace(
    /^([\da-f]{8})-[\da-f-]{27}(\.hosts)$/i,
    "$1…$2",
  );
  return parts.length > 3 ? `…/${parts.at(-2)}/${shortName}` : path;
}

export const appliedHostsProfile = (
  profiles: HostsProfile[],
  system: HostsSnapshot | null,
) => profiles.find((profile) => profile.id === system?.applied_profile_id);
export function describeHostsError(cause: unknown, t: TFunction) {
  const message = getErrorMessage(cause, t("hosts.failed"));
  const line = message.match(/HOSTS_INVALID_LINE:(\d+)/)?.[1];
  if (line)
    return { message: t("hosts.invalidLine", { line }), permission: false };
  for (const [token, key] of [
    ["HOSTS_PROFILE_CONFLICT", "profileConflict"],
    ["HOSTS_PROFILE_INVALID_NAME", "invalidName"],
    ["HOSTS_PROFILE_LIMIT", "profileLimit"],
    ["USER_CONFIG_LINK", "unsafePath"],
    ["USER_CONFIG_TOO_LARGE", "configurationLimit"],
    ["USER_CONFIG_RECOVERY_PENDING", "recoveryPending"],
    ["HOSTS_CONFLICT", "conflict"],
    ["HOSTS_ENCODING", "encoding"],
    ["HOSTS_TOO_LARGE", "tooLarge"],
  ]) {
    if (message.includes(token))
      return { message: t(`hosts.${key}`), permission: false };
  }
  const permission =
    /permission denied|access.*denied|not authori[sz]ed|authori[sz]ation|user cancel|cancell?ed|\(-128\)|\(-6000\d\)|\b740\b|\b1223\b|pkexec|polkit|拒绝访问|权限不足|取消|拒絕存取|權限不足/i.test(
      message,
    );
  return {
    message: t(permission ? "hosts.permissionFailed" : "hosts.failedDetails", {
      message,
    }),
    permission,
  };
}
