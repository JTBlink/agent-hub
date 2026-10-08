import { stripWindowsExtendedPrefix } from "../utils";

/** VS Code's file URI accepts absolute local paths; encode each segment so
 * spaces, Unicode and URI punctuation remain part of the directory name. */
export function vscodeDirectoryUrl(path: string): string {
  const normalized = stripWindowsExtendedPrefix(path).replace(/\\/g, "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized)) {
    throw new Error("VS Code requires an absolute directory path");
  }
  const encoded = normalized.split("/").map(encodeURIComponent).join("/");
  return `vscode://file${encoded.startsWith("/") ? "" : "/"}${encoded}`;
}
