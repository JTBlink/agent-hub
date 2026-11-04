import { useTranslation } from "react-i18next";
import type { SnapshotElement } from "../shared/elementSnapshot";

export function ElementSnapshot({
  elements,
  disabled,
  onInspect,
  onAnnotate,
}: {
  elements: SnapshotElement[];
  disabled: boolean;
  onInspect: (reference: string) => void;
  onAnnotate: (reference: string) => void;
}) {
  const { t } = useTranslation();
  if (!elements.length) return null;
  return (
    <section
      className="preview-element-list"
      aria-label={t("preview.pageElements")}
    >
      <h3>
        {t("preview.pageElements")} ({elements.length})
      </h3>
      {elements.map((element) => (
        <details key={element.ref}>
          <summary>
            {element.role || element.tag} · {element.label || element.selector}
          </summary>
          <code>{element.selector}</code>
          <div className="preview-tool-actions">
            <button disabled={disabled} onClick={() => onInspect(element.ref)}>
              {t("preview.inspectElement")}
            </button>
            <button disabled={disabled} onClick={() => onAnnotate(element.ref)}>
              {t("preview.annotateElement")}
            </button>
          </div>
        </details>
      ))}
    </section>
  );
}
