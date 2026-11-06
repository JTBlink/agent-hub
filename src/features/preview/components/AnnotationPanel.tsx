import {
  ChevronRight,
  Braces,
  Copy,
  Download,
  FileText,
  Globe,
  Image,
  MessageSquareText,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewModel } from "../usePreviewWorkspace";
import { formatAnnotations } from "../shared/session";
import type { AgentDeliveryAdapter } from "../../../lib/agentDelivery";
import { CardActionMenu } from "../../../components/CardActionMenu";
import { AgentDelivery } from "./AgentDelivery";
import { ContextAdder } from "./ContextAdder";
import { ContextDetails } from "./ContextDetails";
import { previewApi } from "../api";
import { PreviewQuickActions } from "./PreviewQuickActions";

export function AnnotationPanel({
  model,
  deliveryAdapter,
  workspacePath,
  projectId,
  onDraw,
  drawingBusy = false,
}: {
  model: PreviewModel;
  deliveryAdapter?: AgentDeliveryAdapter;
  workspacePath?: string;
  projectId?: string;
  onDraw: () => void;
  drawingBusy?: boolean;
}) {
  const { t } = useTranslation();
  const { instruction, setInstruction } = model;
  const latestId = model.notes.at(-1)?.id;
  const [selection, setSelection] = useState<{
    id: string | null;
    lastSeen?: string;
  }>({ id: null });
  const selectedId =
    selection.lastSeen !== latestId ||
    (selection.id !== null &&
      !model.notes.some((note) => note.id === selection.id))
      ? latestId
      : selection.id;
  const setSelectedId = (id: string | null) =>
    setSelection({ id, lastSeen: latestId });
  const [sending, setSending] = useState(false);
  const [reading, setReading] = useState(false);
  const selected = model.notes.find((note) => note.id === selectedId);
  const disabled = model.busy || sending || reading || drawingBusy;
  return (
    <aside className="preview-inspector preview-annotations">
      <header>
        <h2 title={t("preview.annotations")}>{t("preview.annotations")}</h2>
        <PreviewQuickActions
          model={model}
          disabled={disabled}
          onDraw={onDraw}
        />
        <div className="preview-context-header-actions">
          <CardActionMenu
            label={t("preview.contextActions")}
            disabled={disabled}
            actions={[
              {
                key: "address",
                label: t("preview.copyAddress"),
                icon: <Copy size={14} />,
                disabled: !model.active,
                onSelect: () => {
                  const address = model.document?.path ?? model.active?.address;
                  if (address)
                    void import("@tauri-apps/plugin-clipboard-manager")
                      .then((api) => api.writeText(address))
                      .then(() => model.setNotice(t("preview.copied")))
                      .catch(model.report);
                },
              },
              {
                key: "document",
                label: t("preview.exportDocument"),
                icon: <Download size={14} />,
                disabled: !model.document,
                onSelect: () => {
                  if (model.document)
                    void previewApi
                      .export(
                        model.document.title,
                        model.draft ?? model.document.content,
                      )
                      .catch(model.report);
                },
              },
              {
                key: "copy",
                disabled: !model.notes.length && !instruction.trim(),
                label: t("preview.copyNotes"),
                icon: <Copy size={14} />,
                onSelect: () => void model.copyNotes(undefined, instruction),
              },
              {
                key: "export",
                disabled: !model.notes.length && !instruction.trim(),
                label: t("preview.exportNotes"),
                icon: <Download size={14} />,
                onSelect: () => void model.exportNotes(instruction),
              },
            ]}
          />
          <button
            aria-label={t("common.close")}
            onClick={() => model.setPanelOpen(false)}
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="preview-inspector-scroll">
        <p className="preview-context-count">
          {t("preview.noteCount", { count: model.notes.length })}
        </p>
        {model.notes.length ? (
          <div className="preview-annotation-list">
            {model.notes.map((note, index) => {
              const expanded = selected?.id === note.id;
              return (
                <section className="preview-annotation-row" key={note.id}>
                  <button
                    type="button"
                    className="preview-annotation-summary"
                    aria-expanded={expanded}
                    disabled={disabled}
                    title={note.selector}
                    onClick={() => setSelectedId(expanded ? null : note.id)}
                  >
                    <span className="preview-annotation-number">
                      {index + 1}
                    </span>
                    <span className="preview-annotation-label">
                      {note.note.trim() ||
                        note.accessibility?.label ||
                        note.text.trim() ||
                        note.selector}
                    </span>
                    <ChevronRight
                      size={14}
                      className={expanded ? "rotate-90" : undefined}
                    />
                  </button>
                  {expanded && (
                    <fieldset
                      disabled={disabled}
                      className="preview-context-detail"
                    >
                      <ContextDetails
                        model={model}
                        note={note}
                        index={index}
                        instruction={instruction}
                      />
                    </fieldset>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="preview-empty preview-context-empty">
            <MessageSquareText size={25} />
            <h3>{t("preview.emptyAnnotations")}</h3>
            <p>{t("preview.contextComposerHint")}</p>
          </div>
        )}
      </div>
      <AgentDelivery
        adapter={deliveryAdapter}
        workspacePath={workspacePath}
        page={
          model.active
            ? {
                id: model.active.id,
                title:
                  model.document?.path?.split(/[\\/]/).at(-1) ??
                  model.active.title,
                path: model.document?.path,
                projectId,
              }
            : undefined
        }
        text={
          model.active
            ? formatAnnotations(
                model.active,
                model.notes,
                instruction,
                model.document?.path,
              )
            : ""
        }
        images={model.notes.flatMap((note) =>
          note.screenshot ? [note.screenshot] : [],
        )}
        disabled={
          model.busy ||
          drawingBusy ||
          reading ||
          !model.active ||
          (!model.notes.length && !instruction.trim())
        }
        verifyCurrent={() =>
          model.active
            ? model.verifyContext(model.active.id, model.active.revision)
            : Promise.reject(new Error(t("preview.pageChanged")))
        }
        onBusyChange={setSending}
        onSent={(copied) =>
          model.setNotice(t(copied ? "preview.copied" : "preview.delivered"))
        }
        actions={
          <ContextAdder
            model={model}
            disabled={disabled}
            onAdded={setSelectedId}
            onBusyChange={setReading}
            workspacePath={workspacePath}
          />
        }
      >
        <div
          className="preview-context-chips"
          aria-label={t("preview.context")}
        >
          {model.active && (
            <span
              className="preview-context-page"
              title={model.document?.path ?? model.active.address}
            >
              <Globe size={13} />
              <span>
                {model.document?.path?.split(/[\\/]/).at(-1) ??
                  model.active.title}
              </span>
            </span>
          )}
          {model.notes.map((note, index) => {
            const Icon =
              note.contextKind === "image" || note.screenshot
                ? Image
                : note.contextKind
                  ? FileText
                  : Braces;
            const label =
              note.contextKind === "text"
                ? note.note.trim().slice(0, 40) || t("preview.textContext")
                : note.accessibility?.label ||
                  note.selector.split(" > ").at(-1) ||
                  note.selector;
            return (
              <span
                className={`preview-context-chip ${selected?.id === note.id ? "active" : ""}`}
                key={note.id}
              >
                <button
                  disabled={disabled}
                  title={note.selector}
                  aria-expanded={selected?.id === note.id}
                  onClick={() =>
                    setSelectedId(selected?.id === note.id ? null : note.id)
                  }
                  type="button"
                >
                  <span className="preview-annotation-number">{index + 1}</span>
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t("preview.removeContext", { name: label })}
                  onClick={() =>
                    model.setSession((previous) => ({
                      ...previous,
                      annotations: previous.annotations.filter(
                        (item) => item.id !== note.id,
                      ),
                    }))
                  }
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
        <textarea
          aria-label={t("preview.changeRequest")}
          placeholder={t("preview.changeRequestPlaceholder")}
          value={instruction}
          maxLength={4000}
          disabled={disabled}
          rows={3}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </AgentDelivery>
    </aside>
  );
}
