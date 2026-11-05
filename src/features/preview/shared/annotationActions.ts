import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { previewApi } from "../api";
import { formatAnnotations, type Annotation, type PreviewTab } from "./session";
/** Both clipboard and export validate the exact context captured by the user's action. */
export function annotationActions({
  instruction = "",
  tab,
  pageId,
  notes,
  verify,
  onCopied,
  onError,
}: {
  instruction?: string;
  tab?: PreviewTab;
  pageId?: string;
  notes: Annotation[];
  verify: (tabId: string, revision: string) => Promise<void>;
  onCopied: () => void;
  onError: (error: unknown) => void;
}) {
  return {
    copyNotes: async (noteId?: string, request = instruction) => {
      if (!tab) return;
      try {
        const text = formatAnnotations(
          tab,
          noteId ? notes.filter((note) => note.id === noteId) : notes,
          request,
        );
        await verify(tab.id, tab.revision);
        await writeText(text);
        onCopied();
      } catch (error) {
        onError(error);
      }
    },
    exportNotes: async (request = instruction) => {
      if (!tab) return;
      try {
        const text = formatAnnotations(tab, notes, request);
        await verify(tab.id, tab.revision);
        await previewApi.export(
          "page-feedback.md",
          text,
          false,
          tab.kind === "markdown"
            ? undefined
            : { id: pageId ?? "", revision: tab.revision },
        );
      } catch (error) {
        onError(error);
      }
    },
  };
}
