/** Script types with an explicit interpreter in the PTY backend. */
export function isRunnableScript(path: string): boolean {
  return /\.(sh|bash|zsh|fish|bat|cmd|ps1)$/i.test(path);
}
