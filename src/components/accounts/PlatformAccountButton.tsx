import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { taskPlatforms } from "@app/platforms";
import type { TaskProvider } from "../../lib/tauri";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { usePlatformAccounts } from "./usePlatformAccounts";

/** Reusable account-management entry with current CLI identities. */
export function PlatformAccountButton({
  provider,
  refreshKey,
  onClick,
}: {
  provider: TaskProvider | "all";
  refreshKey: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const accounts = usePlatformAccounts(refreshKey).accounts.filter(
    (account) => provider === "all" || account.provider === provider,
  );
  const description = accounts
    .map(
      (account) =>
        `${taskPlatforms.find((platform) => platform.id === account.provider)?.label ?? account.provider} · ${account.host} · @${account.username}`,
    )
    .join("\n");
  return (
    <button
      type="button"
      className="app-button-ghost h-7 min-w-0 max-w-[20vw] gap-1.5 px-2"
      title={
        description
          ? `${t("tasks.accounts")}\n${description}`
          : t("tasks.accounts")
      }
      aria-label={t("tasks.accounts")}
      aria-description={description || undefined}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      {accounts.length ? (
        <>
          {accounts.slice(0, 2).map((account) => (
            <span
              key={JSON.stringify([
                account.provider,
                account.host,
                account.username,
              ])}
              className="inline-flex min-w-0 items-center gap-1.5"
            >
              <RepositoryPlatformIcon
                providers={[account.provider]}
                fallbackLabel={t("tasks.provider")}
              />
              <span className="truncate">@{account.username}</span>
            </span>
          ))}
          {accounts.length > 2 && (
            <span className="shrink-0 tabular-nums">
              +{accounts.length - 2}
            </span>
          )}
        </>
      ) : (
        <>
          <UserRound size={15} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{t("tasks.accounts")}</span>
        </>
      )}
    </button>
  );
}
