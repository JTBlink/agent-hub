import type { TFunction } from "i18next";
import { getErrorKind, getErrorMessage } from "./error";

/** Classify the actionable credential problem without mistaking disk permissions for SSH. */
export function getGitAuthErrorKind(
  error: unknown,
): "https" | "ssh" | "missing" | "storage" | undefined {
  const message = getErrorMessage(error, "");
  if (
    /credential_store_unavailable|cannot (?:read|migrate).*credential|(?:credential|keychain).*(?:corrupt|lookup failed)|failed to read git credential/i.test(
      message,
    )
  )
    return "storage";
  if (
    /permission denied\s*\([^)]*(?:publickey|keyboard-interactive|password)|no supported authentication methods/i.test(
      message,
    )
  )
    return "ssh";
  if (
    /could not read (?:username|password)|unable to get password from user|no credentials available/i.test(
      message,
    )
  )
    return "missing";
  if (
    /authentication (?:failed|attempts exhausted)|invalid username or token|invalid.{0,24}(?:credentials|token)|(?:http|status|returned error)[^\n]{0,24}\b(?:401|403)\b/i.test(
      message,
    )
  )
    return "https";
  return undefined;
}

/**
 * Map a git backup error to the plain-language copy under `settings.gitError*`.
 * Shared by the Backup page and the first-run restore dialog.
 */
export function mapGitErrorMessage(error: unknown, t: TFunction): string {
  const kind = getErrorKind(error);
  const message = getErrorMessage(error, "");

  const auth = getGitAuthErrorKind(error);
  if (auth === "storage") return t("settings.gitErrorCredentialRead");
  if (auth === "ssh") return t("settings.gitErrorSshAuth");
  if (auth === "missing") return t("settings.gitErrorCredentialMissing");
  if (auth === "https") return t("settings.gitErrorAuth");
  if (kind === "network") return t("settings.gitErrorNetwork");
  if (
    message.includes("Could not resolve host") ||
    message.includes("Failed to connect") ||
    message.includes("Connection timed out") ||
    /connection\s+refused/i.test(message)
  ) {
    return t("settings.gitErrorNetwork");
  }
  if (
    message.includes("unrelated histories") ||
    message.includes("refusing to merge")
  ) {
    return t("settings.gitErrorUnrelatedHistories");
  }
  if (
    message.includes("[rejected]") ||
    message.includes("non-fast-forward") ||
    message.includes("fetch first") ||
    message.includes("failed to push some refs")
  ) {
    return t("settings.gitErrorRejected");
  }
  if (
    message.includes("no upstream") ||
    message.includes("has no upstream branch")
  ) {
    return t("settings.gitErrorNoUpstream");
  }
  if (message.includes("CONFLICT") || message.includes("conflict")) {
    return t("settings.gitErrorConflict");
  }
  if (message.includes("not a git repository")) {
    return t("settings.gitErrorNotRepo");
  }
  const detail = message.trim();
  return detail && detail !== "Error"
    ? `${t("settings.gitErrorGeneric")} (${detail})`
    : t("settings.gitErrorGeneric");
}
