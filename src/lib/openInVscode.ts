import { openUrl } from "@tauri-apps/plugin-opener";
import { homeDir, join } from "@tauri-apps/api/path";
import { vscodeDirectoryUrl } from "./skillDirectory";
import { prepareFilePreview } from "./tauri";

/** Open a temporary copy of preview text; external edits do not modify the task. */
export async function openPreviewInVscode(
  path: string,
  content: string,
): Promise<void> {
  const localPath = await prepareFilePreview(path, content);
  await openUrl(vscodeDirectoryUrl(localPath));
}

/** Open an absolute directory in VS Code. Callers handle launch failures. */
export async function openDirectoryInVscode(path: string): Promise<void> {
  await openUrl(vscodeDirectoryUrl(path));
}

/** Open a file relative to its saved local directory, expanding a home prefix. */
export async function openFileInVscode(
  directory: string,
  file: string,
): Promise<void> {
  const root =
    directory === "~" || directory.startsWith("~/")
      ? await join(await homeDir(), directory.slice(2))
      : directory;
  await openUrl(vscodeDirectoryUrl(await join(root, file)));
}
