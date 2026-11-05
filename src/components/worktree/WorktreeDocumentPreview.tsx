import { useEffect, useRef } from "react";
import {
  PreviewWorkspace,
  type PreviewWorkspaceHandle,
} from "../../features/preview/PreviewWorkspace";
import type { PreviewDocument } from "../../features/preview/api";
import { herdrDeliveryAdapter } from "@app/herdr";
import { useWorktreePreviews } from "../../hooks/worktreePreviewsContext";

/** Keep the complete preview feature set inside the existing workspace tab. */
export function WorktreeDocumentPreview({
  document,
  active,
  onSource,
  toolbarContainer,
  workspacePath,
}: {
  document: PreviewDocument;
  active: boolean;
  onSource: () => void;
  toolbarContainer?: HTMLElement | null;
  workspacePath?: string;
}) {
  const workspace = useRef<PreviewWorkspaceHandle>(null);
  const previews = useWorktreePreviews();
  const registerClose = previews?.registerClose;
  useEffect(
    () =>
      registerClose?.(
        document.id,
        () => workspace.current?.requestClose() ?? true,
      ),
    [document.id, registerClose],
  );
  return (
    <PreviewWorkspace
      ref={workspace}
      initialDocument={document}
      embedded
      shown={active}
      deliveryAdapter={herdrDeliveryAdapter}
      workspacePath={workspacePath}
      onClose={() => previews?.close(document.id)}
      onSource={onSource}
      sourceToolbarContainer={active ? toolbarContainer : null}
    />
  );
}
