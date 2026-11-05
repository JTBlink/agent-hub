import {
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

export function AnnotationPanel({
  model,
  deliveryAdapter,
  workspacePath,
}: {
  model: PreviewModel;
  deliveryAdapter?: AgentDeliveryAdapter;
  workspacePath?: string;
}) {
  const { t } = useTranslation();
  const { instruction, setInstruction } = model;
  const [selectedId, setSelectedId] = useState<string | null>();
  const [sending, setSending] = useState(false);
  const [reading, setReading] = useState(false);
  const selected = model.notes.find(
    (note) =>
      note.id ===
      (selectedId === undefined ? model.notes.at(-1)?.id : selectedId),
  );
  const disabled = model.busy || sending || reading;
  return (
    <aside className="preview-inspector preview-annotations">
      <header>
        <h2>{t("preview.annotations")}</h2>
        <div className="preview-context-header-actions">
          <CardActionMenu
            label={t("preview.contextActions")}
            disabled={disabled || (!model.notes.length && !instruction.trim())}
            actions={[
              {
                key: "copy",
                label: t("preview.copyNotes"),
                icon: <Copy size={14} />,
                onSelect: () => void model.copyNotes(undefined, instruction),
              },
              {
                key: "export",
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
        {selected ? (
          <fieldset disabled={disabled} className="preview-context-detail">
            <ContextDetails
              model={model}
              note={selected}
              index={model.notes.indexOf(selected)}
              instruction={instruction}
            />
          </fieldset>
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
        text={
          model.active
            ? formatAnnotations(model.active, model.notes, instruction)
            : ""
        }
        images={model.notes.flatMap((note) =>
          note.screenshot ? [note.screenshot] : [],
        )}
        disabled={
          model.busy ||
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
          />
        }
      >
        <div
          className="preview-context-chips"
          aria-label={t("preview.context")}
        >
          {model.active && (
            <span className="preview-context-page" title={model.active.address}>
              <Globe size={13} />
              <span>{model.active.title}</span>
            </span>
          )}
          {model.notes.map((note) => {
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
