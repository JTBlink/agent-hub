import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "../AgentIcon";
import { useAgentUsage } from "../../hooks/useAgentUsage";
import {
  highestUsage,
  USAGE_PROVIDERS,
  usageAgentKey,
  usageProviderName,
} from "../../lib/agentUsage";
import { AgentUsagePanel } from "./AgentUsagePanel";

export function AgentUsageStatusBar() {
  const { t } = useTranslation();
  const { snapshots, loading, failed, refresh } = useAgentUsage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const visibleProviders = USAGE_PROVIDERS.flatMap((provider) => {
    const snapshot = snapshots.find((item) => item.provider === provider);
    const percent = highestUsage(snapshot);
    return percent !== null && Number.isFinite(percent)
      ? [{ provider, percent }]
      : [];
  });

  return (
    <>
      {visibleProviders.length > 0 && (
        <button
          ref={trigger}
          type="button"
          aria-label={t("agentUsage.title")}
          title={t("agentUsage.title")}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? id : undefined}
          className="app-button-ghost ml-auto flex h-full shrink-0 items-center gap-2 rounded px-1.5"
          onClick={() => {
            setOpen(!open);
            if (!open) void refresh();
          }}
        >
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
                <span className={percent >= 80 ? "text-danger" : ""}>
                  {`${Math.round(percent)}%`}
                </span>
              </span>
            );
          })}
        </button>
      )}
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-labelledby={`${id}-title`}
            tabIndex={-1}
            className="fixed right-2 z-[100] w-80 max-w-[calc(100vw/var(--app-scale)-1rem)] overflow-y-auto rounded-lg border border-border bg-surface p-4 text-primary shadow-2xl outline-none"
            style={{
              bottom:
                "calc(var(--app-statusbar-height) + 8px / var(--app-scale))",
              maxHeight:
                "calc((100vh - 24px) / var(--app-scale) - var(--app-statusbar-height))",
            }}
          >
            <AgentUsagePanel
              snapshots={snapshots}
              loading={loading}
              failed={failed}
              titleId={`${id}-title`}
              onRefresh={() => void refresh(true)}
              onClose={close}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
