import { openUrl } from "@tauri-apps/plugin-opener";
import { vscodeDirectoryUrl } from "./skillDirectory";

/** Open an absolute directory in VS Code. Callers handle launch failures. */
export async function openDirectoryInVscode(path: string): Promise<void> {
  await openUrl(vscodeDirectoryUrl(path));
}
