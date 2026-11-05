import { Camera, Copy, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewModel } from "../usePreviewWorkspace";
import type { Annotation } from "../shared/session";
export function ContextDetails({
  model,
  note,
  index,
  instruction,
}: {
  model: PreviewModel;
  note: Annotation;
  index: number;
  instruction: string;
}) {
  const { t } = useTranslation();
  return (
    <article className="preview-note">
      <header>
        <strong>{note.selector}</strong>
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
      <p>{note.contextKind === "file" ? note.text : note.text.slice(0, 500)}</p>
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
        placeholder={t(
          note.contextKind === "text"
            ? "preview.textContextPlaceholder"
            : "preview.notePlaceholder",
        )}
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
        <button onClick={() => void model.copyNotes(note.id, instruction)}>
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
  );
}
