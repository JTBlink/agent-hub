import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewDocument } from "../../features/preview/api";
import { MarkdownPreview } from "../../features/preview/markdown/MarkdownPreview";
import { BrowserSurface } from "../../features/preview/web/BrowserSurface";
import { followDocumentLink } from "../../features/preview/shared/documentLinks";
import {
  queuePreviewDocument,
  queuePreviewWeb,
} from "../../features/preview/shared/openRequests";
import { getErrorMessage } from "../../lib/error";
import "../../features/preview/preview.css";

/** Workspace previews share the authorized document renderers with the browser module. */
export function WorktreeDocumentPreview({
  document,
  active,
}: {
  document: PreviewDocument;
  active: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  return (
    <section
      hidden={!active}
      className={active ? "preview-workspace overflow-hidden" : "hidden"}
      aria-label={t("fileReader.preview")}
    >
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      {document.kind === "markdown" ? (
        <MarkdownPreview
          document={document}
          active={active}
          draft={document.content}
          source={false}
          picking={false}
          onCapture={() => {}}
          onLink={(href, invert) =>
            void followDocumentLink({
              document,
              href,
              invert,
              acceptDocument: queuePreviewDocument,
              openPage: queuePreviewWeb,
            }).catch((error) =>
              setError(getErrorMessage(error, t("common.error"))),
            )
          }
        />
      ) : (
        <BrowserSurface
          tabId={`worktree-preview:${document.id}`}
          active={active}
          address={document.url ?? "about:blank"}
          profile="default"
          picking={false}
          viewport={null}
          onReady={() => {}}
          onFrame={() => {}}
          onCapture={() => {}}
          onError={setError}
        />
      )}
    </section>
  );
}
