import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { repositoryRoot } from "./shared/paths.mjs";
import { resolve } from "node:path";

const revision = process.argv[2];
if (process.argv.length !== 3 || !/^[a-f0-9]{40}$/.test(revision ?? ""))
  throw new Error(
    "Usage: node scripts/update-default-content.mjs <full commit SHA>",
  );

const lockPath = resolve(repositoryRoot, "products/default-content.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
// The source commit must already be fetched. Building the app never fetches it.
const git = (...args) => execFileSync("git", args, { cwd: repositoryRoot });
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const entries = git("ls-tree", "-rz", revision, "--", "skills", "automations")
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .map((entry) => {
    const fields = /^100(?:644|755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (!fields) throw new Error("Default content must contain regular files");
    const [, blob, path] = fields;
    return [path, decoder.decode(git("cat-file", "blob", blob))];
  });
if (
  !["skills", "automations"].every((directory) =>
    entries.some(([path]) => path.startsWith(directory + "/")),
  )
)
  throw new Error("The source commit must contain skills/ and automations/");
const snapshot = JSON.stringify(Object.fromEntries(entries), null, 2) + "\n";
writeFileSync(
  resolve(repositoryRoot, "src-tauri/default-content.json"),
  snapshot,
);
writeFileSync(
  lockPath,
  JSON.stringify(
    {
      repository: lock.repository,
      revision,
      sha256: createHash("sha256").update(snapshot).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
