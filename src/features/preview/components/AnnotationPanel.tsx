import { Camera, Copy, Send, Trash2, X, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewModel } from "../usePreviewWorkspace";
import { formatAnnotations } from "../shared/session";
export function AnnotationPanel({ model }: { model: PreviewModel }) {
  const { t } = useTranslation();
  return (
    <aside className="preview-inspector">
      <header>
        <h2>{t("preview.annotations")}</h2>
        <button
          aria-label={t("common.close")}
          onClick={() => model.setPanelOpen(false)}
        >
          <X size={16} />
        </button>
      </header>
      <div className="preview-inspector-scroll">
        {!model.notes.length && (
          <div className="preview-empty">
            <Camera size={25} />
            <h3>{t("preview.emptyAnnotations")}</h3>
            <p>{t("preview.annotationHint")}</p>
            <button
              className="app-button-primary"
              disabled={!model.active || model.source}
              onClick={() => model.setPicking(true)}
            >
              {t("preview.pick")}
            </button>
          </div>
        )}
        {model.notes.map((note, index) => (
          <article key={note.id} className="preview-note">
            <header>
              <strong>
                {index + 1}. {note.selector}
              </strong>
              <button
                aria-label={t("common.delete")}
                onClick={() =>
                  model.setSession((previous) => ({
                    ...previous,
                    annotations: previous.annotations.filter(
                      (item) => item.id !== note.id,
                    ),
                  }))
                }
              >
                <Trash2 size={13} />
              </button>
            </header>
            {note.screenshot && (
              <img
                src={`data:image/png;base64,${note.screenshot}`}
                alt={t("preview.elementScreenshot")}
              />
            )}
            <p>{note.text.slice(0, 500)}</p>
            {note.sourceLine && (
              <button
                className="preview-source-link"
                onClick={() => {
                  model.setSource(true);
                  model.setSourceLine(note.sourceLine);
                }}
              >
                {model.active?.title}:{note.sourceLine}
              </button>
            )}
            <textarea
              aria-label={t("preview.annotationNumber", { number: index + 1 })}
              placeholder={t("preview.notePlaceholder")}
              value={note.note}
              maxLength={4000}
              onChange={(event) =>
                model.setSession((previous) => ({
                  ...previous,
                  annotations: previous.annotations.map((item) =>
                    item.id === note.id
                      ? { ...item, note: event.target.value }
                      : item,
                  ),
                }))
              }
            />
            <div className="preview-note-actions">
              <button onClick={() => void model.copyNotes(note.id)}>
                <Copy size={13} />
                {t("preview.copyNote")}
              </button>
              {note.bounds && (
                <button
                  disabled={model.busy}
                  onClick={() => void model.screenshot(false, note.id, true)}
                >
                  <Copy size={13} />
                  {t("preview.copyScreenshot")}
                </button>
              )}
              {note.bounds && (
                <button
                  disabled={model.busy}
                  onClick={() => void model.screenshot(false, note.id)}
                >
                  <Camera size={13} />
                  {t("preview.attachScreenshot")}
                </button>
              )}
              {note.html && (
                <details>
                  <summary>{t("preview.context")}</summary>
                  <pre>{note.html}</pre>
                  <pre>{JSON.stringify(note.styles, null, 2)}</pre>
                </details>
              )}
            </div>
          </article>
        ))}
      </div>
      <footer>
        <div>
          <button
            title={t("preview.copyNotes")}
            disabled={!model.notes.length}
            onClick={() => void model.copyNotes()}
          >
            <Copy size={15} />
          </button>
          <button
            title={t("preview.exportNotes")}
            disabled={!model.notes.length}
            onClick={() => void model.exportNotes()}
          >
            <Download size={15} />
          </button>
          <span>{t("preview.noteCount", { count: model.notes.length })}</span>
        </div>
        <button
          className="app-button-primary"
          disabled={!model.active || !model.notes.length}
          onClick={() => {
            if (model.active)
              model.setDelivery({
                text: formatAnnotations(model.active, model.notes),
                images: model.notes.flatMap((note) =>
                  note.screenshot ? [note.screenshot] : [],
                ),
                tabId: model.active.id,
                revision: model.active.revision,
              });
          }}
        >
          <Send size={14} />
          {t("preview.sendAgent")}
        </button>
      </footer>
    </aside>
  );
}
