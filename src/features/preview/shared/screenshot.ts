import { previewMarkdownElement } from "./previewElements";
import { previewApi } from "../api";
import { captureDocument } from "../markdown/captureDocument";
import type { Annotation, PreviewTab } from "./session";
/** Both renderers return the same native PNG contract for export and attachments. */
export async function capturePreview({
  tab,
  pageId,
  note,
  full,
}: {
  tab: PreviewTab;
  pageId?: string;
  note?: Annotation;
  full: boolean;
}) {
  if (tab.kind === "markdown") {
    const element = previewMarkdownElement(tab.id);
    if (!element) throw Error("Document capture unavailable");
    return captureDocument(element, tab.profile, full, note?.bounds);
  }
  if (!pageId) throw Error("Browser page unavailable");
  const result = await previewApi.action<{ data: string }>(pageId, {
    kind: "screenshot",
    full,
    clip: note?.bounds,
    expected_revision: note?.revision ?? tab.revision,
  });
  return result.data;
}
