import type { PreviewDocument } from "../api";
import { createSession, openPreview, updatePreview } from "./session";

export interface PreviewWorkspaceOptions {
  initialDocument?: PreviewDocument;
  isolated?: boolean;
}

export function documentSession(document: PreviewDocument) {
  const id = `doc:${document.id}`;
  return updatePreview(
    openPreview(createSession(), {
      id,
      kind: document.kind,
      title: document.title,
      address: document.url ?? "",
    }),
    id,
    { revision: `${document.id}:${document.revision}` },
  );
}
