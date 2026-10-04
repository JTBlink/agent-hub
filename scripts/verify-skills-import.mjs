import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT_DIR } from "./build.mjs";

const manifest = JSON.parse(
  readFileSync(
    resolve(ROOT_DIR, "modules/skills-source-manifest.json"),
    "utf8",
  ),
);
const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));
for (const entry of manifest.adaptations ?? []) {
  if (entry.status === "removed") {
    assert(
      !existsSync(resolve(ROOT_DIR, "modules/skills", entry.path)),
      entry.path,
    );
    expected.delete(entry.path);
  } else {
    expected.set(entry.path, entry);
  }
}
for (const [path, entry] of expected) {
  const file = resolve(ROOT_DIR, "modules/skills", path);
  const contents = readFileSync(file);
  assert.equal(
    createHash("sha256").update(contents).digest("hex"),
    entry.sha256,
    path,
  );
  assert.equal(contents.length, entry.bytes, path);
  assert.equal(
    Boolean(statSync(file).mode & 0o111),
    entry.gitMode === "100755",
    path,
  );
}
const tracked = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "modules/skills",
  ],
  { cwd: ROOT_DIR, encoding: "utf8" },
)
  .split("\0")
  .filter((path) => path && existsSync(resolve(ROOT_DIR, path)))
  .map((path) => path.slice("modules/skills/".length));
assert.deepEqual(
  new Set(tracked),
  new Set(expected.keys()),
  "module source file set",
);
console.log(
  `Verified ${expected.size} module files against the import baseline and documented adaptations.`,
);
