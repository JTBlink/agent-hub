import { openUrl } from "@tauri-apps/plugin-opener";
import { homeDir, join } from "@tauri-apps/api/path";
import { vscodeDirectoryUrl } from "./skillDirectory";

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
