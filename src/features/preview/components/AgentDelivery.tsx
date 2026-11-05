import { Send, Copy, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { AgentDeliveryAdapter } from "../../../lib/agentDelivery";
import { DeliveryCommandPreview } from "./DeliveryCommandPreview";
import { DeliveryAgentSelect } from "./DeliveryAgentSelect";
import { previewApi } from "../api";
import { previewError } from "../shared/previewError";

/** Context is composed inline; target resolution happens only on explicit submission. */
export function AgentDelivery({
  adapter,
  workspacePath,
  page,
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
  page?: import("../../../lib/agentDelivery").AgentDeliveryPage;
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
  const scope = JSON.stringify([
    workspacePath,
    page?.projectId,
    page?.path ?? page?.id,
  ]);
  const [agentChoices, setAgentChoices] = useState<Record<string, string>>({});
  const agentId = agentChoices[scope] ?? "";
  const [attachments, setAttachments] = useState(images);
  if (
    attachments.length !== images.length ||
    attachments.some((image, index) => image !== images[index])
  )
    setAttachments(images);
  const [expanded, setExpanded] = useState(false);
  const packetCache = useRef<{
    text: string;
    images: string[];
    packet: ReturnType<typeof previewApi.prepareDelivery>;
  } | null>(null);
  const preparePacket = () => {
    if (!images.length && new TextEncoder().encode(text).length <= 32 * 1024)
      return Promise.resolve(null);
    const cached = packetCache.current;
    if (
      cached?.text === text &&
      cached.images.length === images.length &&
      cached.images.every((image, index) => image === images[index])
    )
      return cached.packet;
    const packet = previewApi.prepareDelivery(text, images);
    packetCache.current = { text, images, packet };
    void packet.catch(() => {
      if (packetCache.current?.packet === packet) packetCache.current = null;
    });
    return packet;
  };
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
        ? await adapter.resolveCurrent(
            workspacePath,
            page,
            ...(agentId ? [agentId] : []),
          )
        : null;
      if (adapter && !target)
        throw new Error(t("preview.currentAgentUnavailable"));
      await verify();
      const packet = await preparePacket();
      if (packet) await verify();
      if (target) await target.send(packet?.prompt ?? text, verify);
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
      <details
        className="preview-delivery-preview"
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>{t("preview.viewDelivery")}</summary>
        <div className="preview-delivery-content">
          {page?.path && <p>{page.path}</p>}
          {adapter && page?.path && (
            <p>{t("preview.fileAgentHint", { name: page.title })}</p>
          )}
          {expanded && adapter?.preview && workspacePath && page && (
            <DeliveryCommandPreview
              key={JSON.stringify([
                scope,
                agentId,
                text,
                images.map((image) => image.length),
              ])}
              adapter={adapter}
              workspacePath={workspacePath}
              page={page}
              agentId={agentId}
              text={text}
              images={attachments}
              preparePrompt={async () => {
                await verifyCurrent();
                const packet = await preparePacket();
                await verifyCurrent();
                return packet?.prompt ?? text;
              }}
            />
          )}
          <pre>{text}</pre>
          {images.map((data, index) => (
            <img
              key={index}
              src={`data:image/png;base64,${data}`}
              alt={t("preview.deliveryImage", { number: index + 1 })}
            />
          ))}
        </div>
      </details>
      {error && (
        <p role="alert" className="preview-context-error">
          {error}
          <span>{t("preview.deliveryFailed")}</span>
        </p>
      )}
      <div className="preview-context-toolbar">
        {actions}
        <span
          className="preview-context-destination"
          title={page?.path ?? workspacePath}
        >
          {adapter && page?.path
            ? t("preview.fileAgentTab", { name: page.title })
            : t(adapter ? "preview.currentWorkspace" : "preview.copyNotes")}
        </span>
        {adapter?.listAgents && (
          <DeliveryAgentSelect
            key={scope}
            adapter={adapter}
            value={agentId}
            disabled={busy}
            onChange={(value) =>
              setAgentChoices((previous) => ({ ...previous, [scope]: value }))
            }
          />
        )}
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
            <Send size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} />
          )}
          {label}
        </button>
      </div>
    </form>
  );
}
