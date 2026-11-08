import { useTranslation } from "react-i18next";
import { RefreshCw, X } from "lucide-react";
import { AgentIcon } from "../AgentIcon";
import { ResetCreditsSection } from "./ResetCreditsSection";
import { SubscriptionPeriod } from "./SubscriptionPeriod";
import {
  currentUsageWindows,
  isUsageWarning,
  quotaTime,
  USAGE_PROVIDERS,
  usageAgentKey,
  usageProviderName,
  type ProviderUsage,
} from "../../lib/agentUsage";

export function AgentUsagePanel({
  now,
  snapshots,
  loading,
  failed,
  titleId,
  onRefresh,
  onClose,
  onUseReset,
  resetNotice,
}: {
  now: number;
  snapshots: ProviderUsage[];
  loading: boolean;
  failed: boolean;
  titleId: string;
  onRefresh: () => void;
  onClose: () => void;
  onUseReset: (creditId?: string) => void;
  resetNotice: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-sm font-semibold">
          {t("agentUsage.title")}
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="app-button-ghost rounded p-1.5"
            aria-label={t("agentUsage.refresh")}
            title={t("agentUsage.refresh")}
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="app-button-ghost rounded p-1.5"
            aria-label={t("common.close")}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        {t("agentUsage.description")}
      </p>
      {resetNotice && (
        <p role="status" className="mb-3 text-xs text-secondary">
          {resetNotice}
        </p>
      )}
      <div className="space-y-4" aria-busy={loading}>
        {USAGE_PROVIDERS.map((provider) => {
          const snapshot = snapshots.find((item) => item.provider === provider);
          const windows = currentUsageWindows(snapshot, now);
          const status =
            snapshot?.status === "ready" && windows.length === 0
              ? "no_data"
              : snapshot?.status;
          return (
            <section key={provider} aria-label={usageProviderName(provider)}>
              <div className="mb-2 flex items-start gap-2 text-sm font-medium">
                <AgentIcon
                  agentKey={usageAgentKey(provider)}
                  className="h-4 w-4 border-0 bg-transparent"
                />
                {usageProviderName(provider)}
                <SubscriptionPeriod snapshot={snapshot} now={now} />
              </div>
              {windows.length ? (
                <div className="space-y-2">
                  {windows.map((window, index) => (
                    <div key={`${window.key}-${index}`}>
                      <div className="mb-1 flex justify-between gap-2 text-xs">
                        <span>
                          {t(`agentUsage.windows.${window.key}`)}
                          {window.window_minutes &&
                          ["primary", "secondary"].includes(window.key)
                            ? ` · ${t("agentUsage.minutes", { count: window.window_minutes })}`
                            : ""}
                        </span>
                        <span
                          className={
                            isUsageWarning(window.used_percent)
                              ? "text-danger"
                              : "text-secondary"
                          }
                        >
                          {t("agentUsage.used", {
                            percent: Math.round(window.used_percent),
                          })}
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`${usageProviderName(provider)} ${t(`agentUsage.windows.${window.key}`)}`}
                        aria-valuenow={window.used_percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-1.5 overflow-hidden rounded-full bg-surface-active"
                      >
                        <div
                          className={`h-full rounded-full ${isUsageWarning(window.used_percent) ? "bg-danger" : "bg-accent"}`}
                          style={{ width: `${window.used_percent}%` }}
                        />
                      </div>
                      {window.resets_at !== null && (
                        <p className="mt-1 text-xs text-muted">
                          {t("agentUsage.resetsAt", {
                            time: quotaTime(window.resets_at, i18n.language),
                          })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : snapshot?.status === "ready" &&
                snapshot.reset_credits ? null : (
                <p className="text-xs leading-relaxed text-muted" role="status">
                  {t(
                    loading && !snapshot
                      ? "agentUsage.loading"
                      : `agentUsage.status.${failed ? "query_failed" : (status ?? "no_data")}`,
                  )}
                </p>
              )}
              {provider === "codex" &&
                (loading ||
                  failed ||
                  !snapshot ||
                  !["not_installed", "signed_out", "unsupported"].includes(
                    snapshot.status,
                  )) && (
                  <ResetCreditsSection
                    credits={
                      snapshot?.status === "ready"
                        ? snapshot.reset_credits
                        : undefined
                    }
                    now={now}
                    busy={loading}
                    error={
                      failed ||
                      (snapshot &&
                        !["ready", "no_data"].includes(snapshot.status))
                        ? t("agentUsage.resetCredits.queryFailed")
                        : undefined
                    }
                    onUse={onUseReset}
                  />
                )}
              {snapshot && (
                <p className="mt-2 text-xs text-accent-light">
                  {t("agentUsage.checkedAt", {
                    time: quotaTime(snapshot.updated_at, i18n.language),
                  })}
                </p>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-4 border-t border-border-subtle pt-3 text-xs leading-relaxed text-muted">
        {t("agentUsage.loginHint")}
      </p>
    </>
  );
}
