import { useTranslation } from "react-i18next";
import {
  subscriptionState,
  subscriptionTime,
  type ProviderUsage,
} from "../../lib/agentUsage";

export function SubscriptionPeriod({
  snapshot,
  now,
}: {
  snapshot: ProviderUsage | undefined;
  now: number;
}) {
  const { t, i18n } = useTranslation();
  const state = subscriptionState(snapshot, now);
  const period = snapshot?.subscription;
  if (!state || !period) return null;
  return (
    <span className="min-w-0 flex-1 text-xs font-normal">
      <span className={state === "current" ? "text-muted" : "text-danger"}>
        {t("agentUsage.subscription.validUntil", {
          time: subscriptionTime(period.active_until, i18n.language),
        })}
      </span>
      {state !== "current" && (
        <span className="ml-1 text-danger" role="status">
          {t(`agentUsage.subscription.${state}`)}
        </span>
      )}
      <span className="mt-0.5 block text-muted">
        {t("agentUsage.subscription.cached")}
        {period.last_checked_at != null &&
          Number.isFinite(period.last_checked_at) &&
          period.last_checked_at > 0 &&
          period.last_checked_at <= 253402300799 && (
            <>
              {" "}
              {t("agentUsage.subscription.checkedAt", {
                time: subscriptionTime(period.last_checked_at, i18n.language),
              })}
            </>
          )}
      </span>
    </span>
  );
}
