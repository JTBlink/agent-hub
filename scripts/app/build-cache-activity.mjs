import { spawnSync } from "node:child_process";

const compilers = new Set([
  "cargo",
  "cargo-clippy",
  "rustc",
  "clippy-driver",
  "rust-lld",
]);

/** Conservatively defer deletion while any Cargo compiler process is running. */
export function cargoBuildActive({
  platform = process.platform,
  runner = spawnSync,
} = {}) {
  const windows = platform === "win32";
  const result = runner(
    windows ? "powershell.exe" : "ps",
    windows
      ? [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-Process | Select-Object -ExpandProperty ProcessName",
        ]
      : ["-A", "-o", "comm="],
    {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      "Cannot verify whether a Cargo build is running; cache cleanup was skipped",
    );
  return String(result.stdout ?? "")
    .split(/\r?\n/)
    .some((line) => {
      const name = line
        .trim()
        .replace(/\s+\(deleted\)$/, "")
        .split(/[\\/]/)
        .at(-1)
        .replace(/^\(|\)$/g, "")
        .replace(/\.exe$/i, "");
      return compilers.has(name);
    });
}
