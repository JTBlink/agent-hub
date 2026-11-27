import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const [, , lockArg, destinationArg] = process.argv;
if (!lockArg || !destinationArg || process.argv.length !== 4)
  throw new Error("Usage: node install.mjs <sdk-lock.json> <new-directory>");
const lockPath = resolve(lockArg);
const destination = resolve(destinationArg);
const lock = JSON.parse(await readFile(lockPath, "utf8"));
if (
  !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(lock.version) ||
  !/^[0-9a-f]{64}$/.test(lock.sha256) ||
  !/^[0-9a-f]{40,64}$/.test(lock.revision) ||
  typeof lock.source !== "string" ||
  !lock.source.trim()
)
  throw new Error("Invalid SDK lock file");

const parent = dirname(destination);
await mkdir(parent, { recursive: true });
const existing = await access(destination).then(
  () => true,
  (error) => {
    if (error.code !== "ENOENT") throw error;
    return false;
  },
);
if (existing) throw new Error("SDK destination already exists");
const staged = await mkdtemp(join(parent, ".agenthub-sdk-"));
try {
  const archive = join(staged, "download.tar.gz");
  if (lock.source.startsWith("https://")) {
    const response = await fetch(lock.source, {
      signal: AbortSignal.timeout(60_000),
    });
    if (
      !response.ok ||
      !response.body ||
      new URL(response.url).protocol !== "https:"
    )
      throw new Error(`Could not download SDK (HTTP ${response.status})`);
    await pipeline(response.body, createWriteStream(archive));
  } else {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(lock.source))
      throw new Error("SDK URLs must use HTTPS");
    await copyFile(resolve(dirname(lockPath), lock.source), archive);
  }
  const digest = createHash("sha256");
  for await (const bytes of createReadStream(archive)) digest.update(bytes);
  if (digest.digest("hex") !== lock.sha256)
    throw new Error("SDK SHA-256 mismatch");

  const list = (flag) =>
    execFileSync("tar", [flag, archive], { encoding: "utf8" })
      .trimEnd()
      .split("\n");
  if (
    list("-tzf").some(
      (path) =>
        !/^agent-hub-core(?:\/|$)/.test(path) ||
        /(?:^|\/)\.\.(?:\/|$)|\\/.test(path),
    ) ||
    list("-tvzf").some((entry) => !/^[-d]/.test(entry))
  )
    throw new Error("Unexpected entry in SDK archive");
  execFileSync("tar", ["-xzf", archive, "-C", staged]);
  const root = join(staged, "agent-hub-core");
  for (const [name, expected] of [
    ["SDK_VERSION", lock.version],
    ["SDK_REVISION", lock.revision],
  ]) {
    if ((await readFile(join(root, name), "utf8")).trim() !== expected)
      throw new Error(`SDK lock does not match ${name}`);
  }
  await rename(root, destination);
  process.stdout.write(destination + "\n");
} finally {
  await rm(staged, { recursive: true, force: true });
}
