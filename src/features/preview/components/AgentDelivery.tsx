import { previewError } from "../shared/previewError";
import { previewApi } from "../api";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ThemedSelect } from "../../../components/ThemedSelect";
import type {
  AgentDeliveryAdapter,
  AgentDeliveryDestination,
} from "../../../lib/agentDelivery";
import type { Annotation, PreviewTab } from "../shared/session";
export function AgentDelivery({
  adapter,
  text,
  images,
  stale,
  page,
  annotations = [],
  verifyCurrent,
  onClose,
  onSent,
}: {
  adapter?: AgentDeliveryAdapter;
  text: string;
  images: string[];
  stale: boolean;
  page?: Pick<PreviewTab, "title" | "address" | "revision">;
  annotations?: Annotation[];
  verifyCurrent: () => Promise<void>;
  onClose: () => void;
  onSent: (copied: boolean) => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const [draft, setDraft] = useState(text);
  const [target, setTarget] = useState<AgentDeliveryDestination | null>(null);
  const [selected, setSelected] = useState(adapter?.id ?? "copy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => {
      mounted.current = false;
      element?.close();
    };
  }, []);
  const send = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const verify = async () => {
        if (!mounted.current) throw new Error(t("preview.pageChanged"));
        await verifyCurrent();
        if (!mounted.current) throw new Error(t("preview.pageChanged"));
      };
      await verify();
      const packet =
        images.length || new TextEncoder().encode(draft).length > 32 * 1024
          ? await previewApi.prepareDelivery(draft, images)
          : null;
      if (packet) await verify();
      if (selected === "copy") await writeText(packet?.context ?? draft);
      else {
        if (!target) throw new Error(t("preview.targetUnavailable"));
        await target.send(packet?.prompt ?? draft);
      }
      if (mounted.current) onSent(selected === "copy");
    } catch (error) {
      if (mounted.current) setError(previewError(error, t));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="preview-delivery"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2>{t("preview.sendAgent")}</h2>
        <button
          disabled={busy}
          aria-label={t("common.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p className="text-xs text-muted">{t("preview.deliveryHint")}</p>
      <label>
        {t("preview.target")}
        <ThemedSelect
          disabled={busy}
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setTarget(null);
          }}
        >
          <option value="copy">{t("preview.copyOnly")}</option>
          {adapter && <option value={adapter.id}>{adapter.label}</option>}
        </ThemedSelect>
      </label>
      {selected !== "copy" && adapter && (
        <adapter.TargetPicker disabled={busy} onChange={setTarget} />
      )}
      {page && (
        <section className="text-xs break-all">
          <strong>{page.title}</strong>
          <p>{page.address}</p>
          <p>Revision: {page.revision}</p>
          <p>{t("preview.noteCount", { count: annotations.length })}</p>
          {annotations.map((note) => (
            <article key={note.id}>
              <strong>{note.selector}</strong>
              <p>{note.note || note.text}</p>
              <p>
                {note.screenshot
                  ? t("preview.elementScreenshot")
                  : t("preview.noScreenshot")}
                {note.screenshot &&
                  note.bounds &&
                  ` · x=${note.bounds.x}, y=${note.bounds.y}, ${note.bounds.width} × ${note.bounds.height}`}
              </p>
              {note.screenshot && (
                <img
                  className="max-h-32 max-w-full object-contain"
                  src={`data:image/png;base64,${note.screenshot}`}
                  alt={t("preview.elementScreenshot")}
                />
              )}
            </article>
          ))}
        </section>
      )}
      <label>
        {t("preview.context")}
        <textarea
          disabled={busy}
          rows={14}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={256 * 1024}
        />
      </label>
      {images.length > 0 && (
        <p className="text-xs text-muted">
          {t("preview.deliveryImages", { count: images.length })}
        </p>
      )}
      {stale && (
        <p className="text-xs text-danger">{t("preview.pageChanged")}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
          {selected !== "copy" && (
            <span className="block">{t("preview.deliveryFailed")}</span>
          )}
        </p>
      )}
      <footer>
        <button className="app-button-ghost" disabled={busy} onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          className="app-button-primary"
          disabled={
            busy || !draft.trim() || stale || (selected !== "copy" && !target)
          }
          onClick={() => void send()}
        >
          {busy
            ? t("common.loading")
            : selected === "copy"
              ? t("preview.copyNotes")
              : t("preview.deliver")}
        </button>
      </footer>
    </dialog>
  );
}
