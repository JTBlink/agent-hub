import { ArrowUp, Copy, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { AgentDeliveryAdapter } from "../../../lib/agentDelivery";
import { previewApi } from "../api";
import { previewError } from "../shared/previewError";

/** Context is composed inline; target resolution happens only on explicit submission. */
export function AgentDelivery({
  adapter,
  workspacePath,
  text,
  images,
  disabled,
  verifyCurrent,
  onSent,
  onBusyChange,
  children,
  actions,
}: {
  adapter?: AgentDeliveryAdapter;
  workspacePath?: string;
  text: string;
  images: string[];
  disabled: boolean;
  verifyCurrent: () => Promise<void>;
  onSent: (copied: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const sending = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const send = async () => {
    if (sending.current || disabled || !text.trim()) return;
    sending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const verify = async () => {
        if (!mounted.current) throw new Error(t("preview.pageChanged"));
        await verifyCurrent();
        if (!mounted.current) throw new Error(t("preview.pageChanged"));
      };
      await verify();
      const target = adapter
        ? await adapter.resolveCurrent(workspacePath)
        : null;
      if (adapter && !target)
        throw new Error(t("preview.currentAgentUnavailable"));
      await verify();
      const packet =
        images.length || new TextEncoder().encode(text).length > 32 * 1024
          ? await previewApi.prepareDelivery(text, images)
          : null;
      if (packet) await verify();
      if (target) await target.send(packet?.prompt ?? text);
      else await writeText(packet?.context ?? text);
      if (mounted.current) onSent(!adapter);
    } catch (error) {
      if (mounted.current) setError(previewError(error, t));
    } finally {
      sending.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };
  const label = t(adapter ? "preview.sendAgent" : "preview.copyNotes");
  return (
    <form
      className="preview-context-composer"
      aria-label={t("preview.sendAgent")}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {children}
      {error && (
        <p role="alert" className="preview-context-error">
          {error}
          <span>{t("preview.deliveryFailed")}</span>
        </p>
      )}
      <div className="preview-context-toolbar">
        {actions}
        <span className="preview-context-destination" title={workspacePath}>
          {t(adapter ? "preview.currentWorkspace" : "preview.copyNotes")}
        </span>
        <button
          type="submit"
          className="preview-context-send"
          title={label}
          aria-label={label}
          disabled={busy || disabled || !text.trim()}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" size={16} />
          ) : adapter ? (
            <ArrowUp size={16} />
          ) : (
            <Copy size={16} />
          )}
        </button>
      </div>
    </form>
  );
}
