import { invoke } from "@tauri-apps/api/core";

export type ImageRevision = "working" | "index" | "head" | "commit" | "parent";
export interface ImageSource {
  projectId: string;
  worktreePath?: string;
  path: string;
  revision: ImageRevision;
  sha?: string;
}
export interface ImageData {
  url: string;
  bytes: number;
}
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};
export function imageMimeType(path: string) {
  const extension = path.match(/\.([^./\\]+)$/)?.[1].toLowerCase() ?? "";
  return Object.hasOwn(MIME_TYPES, extension)
    ? MIME_TYPES[extension]
    : undefined;
}
export const isPreviewableImage = (path: string) => !!imageMimeType(path);

/** Raw IPC avoids JSON/base64 copies. The mounted preview owns the resulting Blob URL. */
export async function readProjectImage(
  source: ImageSource,
): Promise<Blob | null> {
  const bytes = await invoke<ArrayBuffer>("read_project_image", { ...source });
  return bytes.byteLength === 0
    ? null
    : new Blob([bytes], { type: imageMimeType(source.path) });
}
