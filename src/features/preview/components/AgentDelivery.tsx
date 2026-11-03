import { previewError } from "../shared/previewError";
import { previewApi } from "../api";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ThemedSelect } from "../../../components/ThemedSelect";
import {
  getHerdrInventory,
  getHerdrSnapshot,
  herdrTarget,
  runHerdrAction,
  type HerdrTarget,
} from "../../herdr/lib/herdrControlApi";
import { getErrorMessage } from "../../../lib/error";
export function AgentDelivery({
  text,
  images,
  stale,
  verifyCurrent,
  onClose,
  onSent,
}: {
  text: string;
  images: string[];
  stale: boolean;
  verifyCurrent: () => Promise<void>;
  onClose: () => void;
  onSent: (copied: boolean) => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const [draft, setDraft] = useState(text);
  const [targets, setTargets] = useState<
    { id: string; label: string; target: HerdrTarget }[]
  >([]);
  const [selected, setSelected] = useState("copy");
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
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const inventory = await getHerdrInventory();
        if (!inventory.installed) return;
        const all = [];
        for (const session of inventory.sessions
          .filter((item) => item.running)
          .slice(0, 10)) {
          const snapshot = await getHerdrSnapshot(session.name);
          for (const pane of snapshot.agents) {
            if (!pane.agent) continue;
            all.push({
              id: `${session.name}:${pane.pane_id}`,
              label: `${pane.name || pane.agent} / ${snapshot.workspaces.find((item) => item.workspace_id === pane.workspace_id)?.label ?? session.name}`,
              target: herdrTarget(session.name, pane),
            });
          }
        }
        if (!disposed) setTargets(all);
      } catch (error) {
        if (!disposed) setError(getErrorMessage(error, t("common.error")));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [t]);
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
        images.length || draft.length > 48000
          ? await previewApi.prepareDelivery(draft, images)
          : null;
      if (packet) await verify();
      if (selected === "copy") await writeText(packet?.context ?? draft);
      else {
        const entry = targets.find((item) => item.id === selected);
        if (!entry) throw new Error(t("preview.targetUnavailable"));
        await runHerdrAction(entry.target, "prompt", packet?.prompt ?? draft);
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
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="copy">{t("preview.copyOnly")}</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </ThemedSelect>
      </label>
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
        </p>
      )}
      <footer>
        <button className="app-button-ghost" disabled={busy} onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          className="app-button-primary"
          disabled={busy || !draft.trim() || stale}
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
