import { useTranslation } from "react-i18next";
import {
  quotaTime,
  resetCreditExpiring,
  type ResetCredits,
} from "../../lib/agentUsage";

/** Available earned resets are separate from the subscription's automatic reset. */
export function ResetCreditsSection({
  credits,
  now,
}: {
  credits: ResetCredits;
  now: number;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section
      className="mt-3 border-t border-border-subtle pt-2"
      aria-label={t("agentUsage.resetCredits.title")}
    >
      <div className="flex justify-between gap-2 text-xs font-medium">
        <span>{t("agentUsage.resetCredits.title")}</span>
        <span>
          {t("agentUsage.resetCredits.available", {
            count: credits.available_count,
          })}
        </span>
      </div>
      {credits.credits === null && credits.available_count > 0 && (
        <p className="mt-1 text-xs text-muted">
          {t("agentUsage.resetCredits.detailsUnavailable")}
        </p>
      )}
      {credits.credits && credits.credits.length > 0 && (
        <ul className="mt-2 space-y-2">
          {credits.credits.map((credit, index) => {
            const expiring = resetCreditExpiring(credit, now);
            const expired =
              credit.expires_at !== null && credit.expires_at * 1000 <= now;
            return (
              <li
                key={index}
                className={
                  expiring ? "text-xs text-danger" : "text-xs text-muted"
                }
              >
                <p className="break-words">
                  {credit.title ??
                    t(
                      `agentUsage.resetCredits.${credit.reset_type === "codexRateLimits" ? "fullReset" : "reset"}`,
                    )}
                </p>
                <p>
                  {credit.expires_at === null
                    ? t("agentUsage.resetCredits.expiryUnknown")
                    : t("agentUsage.resetCredits.expiresAt", {
                        time: quotaTime(credit.expires_at, i18n.language),
                      })}
                </p>
                {expiring && <p>{t("agentUsage.resetCredits.expiring")}</p>}
                {expired && <p>{t("agentUsage.resetCredits.expired")}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
