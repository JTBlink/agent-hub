import { useEffect, useRef } from "react";
import { previewApi, type PreviewDocument } from "../api";

/** The parent owns the initial grant; this session owns documents opened by its links. */
export function useIsolatedPreviewDocuments(
  isolated: boolean,
  initialId: string | undefined,
  documents: Record<string, PreviewDocument>,
) {
  const current = useRef(documents);
  useEffect(() => {
    current.current = documents;
  }, [documents]);
  useEffect(
    () => () => {
      if (!isolated) return;
      for (const document of Object.values(current.current)) {
        if (document.id !== initialId)
          void previewApi.closeDocument(document.id).catch(() => {});
      }
    },
    [isolated, initialId],
  );
}
