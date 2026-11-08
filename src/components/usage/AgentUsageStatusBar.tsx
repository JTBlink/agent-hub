import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Gauge } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "../AgentIcon";
import { useCurrentTime } from "../../hooks/useCurrentTime";
import { useAgentUsage } from "../../hooks/useAgentUsage";
import {
  highestUsage,
  isUsageWarning,
  hasExpiringResetCredits,
  USAGE_PROVIDERS,
  usageAgentKey,
  usageProviderName,
} from "../../lib/agentUsage";
import { UseResetCreditDialog } from "./UseResetCreditDialog";
import { AgentUsagePanel } from "./AgentUsagePanel";
import { readTerminalLayout } from "../../lib/terminalLayout";

const hasHerdrLaunch = () =>
  readTerminalLayout().tabs.some(
    (tab) =>
      !!tab.herdrTarget || Object.keys(tab.paneAttachments ?? {}).length > 0,
  );

export function AgentUsageStatusBar() {
  const { t } = useTranslation();
  const now = useCurrentTime();
  const { snapshots, loading, failed, refresh, consumeReset } = useAgentUsage();
  const [open, setOpen] = useState(false);
  const [resetSelection, setResetSelection] = useState<{
    creditId?: string;
  } | null>(null);
  const [resetNotice, setResetNotice] = useState("");
  const [herdrLaunch, setHerdrLaunch] = useState(hasHerdrLaunch);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const refreshHerdrLaunch = () => setHerdrLaunch(hasHerdrLaunch());
    const timer = window.setInterval(refreshHerdrLaunch, 1000);
    window.addEventListener("focus", refreshHerdrLaunch);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshHerdrLaunch);
    };
  }, []);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open || resetSelection) return;
    panel.current?.focus();
    const outside = (event: MouseEvent | FocusEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, resetSelection]);

  const visibleProviders = USAGE_PROVIDERS.flatMap((provider) => {
    const snapshot = snapshots.find((item) => item.provider === provider);
    const percent = highestUsage(snapshot, now);
    return percent !== null && Number.isFinite(percent)
      ? [{ provider, percent }]
      : [];
  });

  const expiringReset = snapshots.some((snapshot) =>
    hasExpiringResetCredits(snapshot, now),
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t("agentUsage.title")}
        title={t("agentUsage.title")}
        aria-expanded={open}
        aria-busy={loading}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        className="app-button-ghost ml-auto flex h-full shrink-0 items-center gap-2 rounded px-1.5"
        onClick={() => {
          setOpen(!open);
          if (!open) void refresh();
        }}
      >
        {expiringReset && (
          <span
            className="inline-flex items-center gap-1 text-danger"
            title={t("agentUsage.resetCredits.expiring")}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("agentUsage.resetCredits.useSoon")}</span>
          </span>
        )}
        {visibleProviders.length === 0 && (
          <>
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("agentUsage.title")}</span>
          </>
        )}
        {visibleProviders.map(({ provider, percent }) => {
          return (
            <span
              key={provider}
              className="inline-flex items-center gap-1"
              title={`${usageProviderName(provider)} · ${t("agentUsage.used", { percent: Math.round(percent) })}`}
            >
              <AgentIcon
                agentKey={usageAgentKey(provider)}
                className="h-3.5 w-3.5 border-0 bg-transparent"
              />
              <span className={isUsageWarning(percent) ? "text-danger" : ""}>
                {`${Math.round(percent)}%`}
              </span>
            </span>
          );
        })}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-labelledby={`${id}-title`}
            tabIndex={-1}
            className="fixed right-2 z-[100] w-96 max-w-[calc(100vw/var(--app-scale)-1rem)] overflow-y-auto rounded-lg border border-border bg-surface p-4 text-primary shadow-2xl outline-none"
            style={{
              bottom:
                "calc(var(--app-statusbar-height) + 8px / var(--app-scale))",
              maxHeight:
                "calc((100vh - 24px) / var(--app-scale) - var(--app-statusbar-height))",
            }}
          >
            <AgentUsagePanel
              now={now}
              resetNotice={resetNotice}
              onUseReset={(creditId) => {
                setResetNotice("");
                setResetSelection({ creditId });
              }}
              snapshots={snapshots}
              herdrLaunch={herdrLaunch}
              loading={loading}
              failed={failed}
              titleId={`${id}-title`}
              onRefresh={() => void refresh(true)}
              onClose={close}
            />
          </div>,
          document.body,
        )}
      {resetSelection &&
        createPortal(
          <UseResetCreditDialog
            creditId={resetSelection.creditId}
            busy={loading}
            onConsume={consumeReset}
            onResult={(result) => {
              const success =
                result.outcome === "reset" ||
                result.outcome === "already_redeemed";
              setResetNotice(
                t(
                  `agentUsage.resetCredits.${success && result.refresh_error ? "refreshFailed" : result.outcome === "reset" ? "completed" : result.outcome}`,
                ),
              );
            }}
            onClose={() => setResetSelection(null)}
          />,
          document.body,
        )}
    </>
  );
}
