import { openUrl } from "@tauri-apps/plugin-opener";
import { dirname, homeDir, join } from "@tauri-apps/api/path";
import { vscodeDirectoryUrl } from "./skillDirectory";
import { prepareFilePreview } from "./tauri";

/** Open a temporary copy of preview text; external edits do not modify the task. */
export async function openPreviewInVscode(
  path: string,
  content: string,
): Promise<void> {
  const localPath = await prepareFilePreview(path, content);
  await openPathInVscode(localPath);
}

/** Open an absolute or home-relative local file or directory in VS Code. Callers handle launch failures. */
export async function openPathInVscode(path: string): Promise<void> {
  await openUrl(vscodeDirectoryUrl(await expandHomePath(path)));
}

export const openDirectoryInVscode = openPathInVscode;

/** Resolve the parent using the desktop platform's path rules. */
export async function openContainingDirectoryInVscode(
  path: string,
): Promise<void> {
  await openPathInVscode(await dirname(await expandHomePath(path)));
}

const expandHomePath = async (path: string) =>
  path === "~" || path.startsWith("~/")
    ? join(await homeDir(), path.slice(2))
    : path;

/** Open a file relative to its saved local directory, expanding a home prefix. */
export async function openFileInVscode(
  directory: string,
  file: string,
): Promise<void> {
  await openPathInVscode(await join(await expandHomePath(directory), file));
}
