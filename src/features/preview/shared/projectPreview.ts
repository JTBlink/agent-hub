import fileTypes from "../../../../shared/preview-file-types.json";
import { previewApi } from "../api";
import { queuePreviewDocument } from "./openRequests";

export function canPreviewDocument(path: string): boolean {
  const extension = path
    .split(/[\\/]/)
    .at(-1)
    ?.split(".")
    .slice(1)
    .at(-1)
    ?.toLowerCase();
  return (
    extension !== undefined &&
    fileTypes.some((type) => type.extensions.includes(extension))
  );
}

export async function openProjectPreview(
  projectId: string,
  worktreePath: string,
  path: string,
  url?: string,
): Promise<void> {
  const document = await previewApi.openProject(projectId, worktreePath, path);
  queuePreviewDocument(url ? { ...document, url } : document);
}
