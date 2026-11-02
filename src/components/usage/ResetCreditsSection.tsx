import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  quotaTime,
  resetCreditExpiring,
  type ResetCredits,
} from "../../lib/agentUsage";

/** Available earned resets are separate from the subscription's automatic reset. */
export function ResetCreditsSection({
  credits,
  now,
  busy,
  error,
  onUse,
}: {
  credits?: ResetCredits | null;
  now: number;
  busy: boolean;
  error?: string;
  onUse: (creditId?: string) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section
      className="mt-3 border-t border-border-subtle pt-2"
      aria-label={t("agentUsage.resetCredits.title")}
      aria-busy={busy}
    >
      <div className="flex justify-between gap-2 text-xs font-medium">
        <span>{t("agentUsage.resetCredits.title")}</span>
        {credits && (
          <span>
            {t("agentUsage.resetCredits.available", {
              count: credits.available_count,
            })}
          </span>
        )}
      </div>
      {busy && (
        <p
          role="status"
          className="mt-2 flex items-center gap-1.5 text-xs text-muted"
        >
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          {t("agentUsage.resetCredits.loading")}
        </p>
      )}
      {!busy && !credits && (
        <p
          role={error ? "alert" : "status"}
          className="mt-2 text-xs text-muted"
        >
          {error ?? t("agentUsage.resetCredits.unavailable")}
        </p>
      )}
      {credits &&
        !credits.credits?.some((credit) => credit.id) &&
        credits.available_count > 0 && (
          <button
            type="button"
            className="app-button-secondary mt-2 text-xs"
            disabled={busy}
            onClick={() => onUse()}
          >
            {t("agentUsage.resetCredits.use")}
          </button>
        )}
      {credits && !credits.credits?.length && credits.available_count > 0 && (
        <p className="mt-1 text-xs text-muted">
          {t("agentUsage.resetCredits.detailsUnavailable")}
        </p>
      )}
      {credits?.credits && credits.credits.length > 0 && (
        <ul className="mt-2 space-y-2">
          {credits.credits.map((credit, index) => {
            const expiring = resetCreditExpiring(credit, now);
            const expired =
              credit.expires_at !== null && credit.expires_at * 1000 <= now;
            const title =
              credit.title ??
              t(
                `agentUsage.resetCredits.${credit.reset_type === "codexRateLimits" ? "fullReset" : "reset"}`,
              );
            const expiry =
              credit.expires_at === null
                ? t("agentUsage.resetCredits.expiryUnknown")
                : t("agentUsage.resetCredits.expiresAt", {
                    time: quotaTime(credit.expires_at, i18n.language),
                  });
            return (
              <li
                key={index}
                className={`flex items-center justify-between gap-3 border-t border-border-subtle pt-2 text-xs ${expiring ? "text-danger" : "text-muted"}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="max-w-24 shrink-0 truncate" title={title}>
                    {title}
                  </span>
                  <span className="min-w-0 truncate" title={expiry}>
                    {expiry}
                  </span>
                  {expiring && (
                    <span
                      className="shrink-0"
                      title={t("agentUsage.resetCredits.expiring")}
                    >
                      <AlertTriangle
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      <span className="sr-only">
                        {t("agentUsage.resetCredits.expiring")}
                      </span>
                    </span>
                  )}
                  {expired && (
                    <span className="shrink-0 whitespace-nowrap">
                      {t("agentUsage.resetCredits.expired")}
                    </span>
                  )}
                </div>
                {credit.id && (
                  <button
                    type="button"
                    className="app-button-secondary h-auto shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs"
                    disabled={busy || expired || credits.available_count === 0}
                    onClick={() => onUse(credit.id ?? undefined)}
                  >
                    {t("agentUsage.resetCredits.use")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
