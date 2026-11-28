import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [directory, version] = process.argv.slice(2);
if (!directory || !/^\d+\.\d+\.\d+$/.test(version ?? ""))
  throw new Error(
    "Usage: node publish-registry.mjs <registry-directory> <version>",
  );
if (!process.env.CARGO_REGISTRY_TOKEN)
  throw new Error("The sdk-release environment needs CARGO_REGISTRY_TOKEN");
const root = resolve(directory);
const metadata = JSON.parse(
  readFileSync(join(root, "agent-hub-core/registry-sdk.json"), "utf8"),
);
if (metadata.version !== version)
  throw new Error("SDK registry version mismatch");

const get = (url) => fetch(url, { signal: AbortSignal.timeout(60_000) });
for (const [name, witness] of [
  ["agent-hub-fonts", "payload.tar.gz"],
  ["agent-hub-desktop", "payload.tar.gz"],
  ["agent-hub-core", "registry-sdk.json"],
]) {
  const response = await get(`https://index.crates.io/ag/en/${name}`);
  if (!response.ok && response.status !== 404)
    throw new Error(
      `Cannot check registry index for ${name}: HTTP ${response.status}`,
    );
  const existing =
    response.ok &&
    (await response.text())
      .trim()
      .split("\n")
      .map(JSON.parse)
      .find((entry) => entry.vers === version);
  if (existing) {
    if (existing.yanked) throw new Error(`${name}@${version} is yanked`);
    const artifact = await get(
      `https://static.crates.io/crates/${name}/${name}-${version}.crate`,
    );
    if (!artifact.ok)
      throw new Error(
        `Cannot download ${name}@${version}: HTTP ${artifact.status}`,
      );
    const temporary = mkdtempSync(join(tmpdir(), "agenthub-registry-check-"));
    try {
      const archive = join(temporary, "published.crate");
      writeFileSync(archive, Buffer.from(await artifact.arrayBuffer()));
      const previous = execFileSync(
        "tar",
        ["-xOzf", archive, `${name}-${version}/${witness}`],
        {
          maxBuffer: 10_000_000,
        },
      );
      if (!previous.equals(readFileSync(join(root, name, witness))))
        throw new Error(
          `${name}@${version} already exists with different SDK data`,
        );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
    process.stdout.write(`Verified existing ${name}@${version}\n`);
    continue;
  }
  const args = ["publish", "--locked", "-p", name];
  if (name === "agent-hub-core") args.push("--all-features");
  execFileSync("cargo", args, { cwd: root, stdio: "inherit" });
}
