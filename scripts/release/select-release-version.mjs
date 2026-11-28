import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const stablePattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function compareStable(left, right) {
  const a = left.split(".").map(BigInt);
  const b = right.split(".").map(BigInt);
  const index = a.findIndex((part, offset) => part !== b[offset]);
  return index === -1 ? 0 : a[index] > b[index] ? 1 : -1;
}

export function selectReleaseVersion({
  current,
  tags,
  version = "",
  resumeVersion = "",
  bump = "",
}) {
  if (!versionPattern.test(current)) throw new Error("Invalid VERSION");
  if (version && resumeVersion)
    throw new Error("Choose either explicit version or resume version");
  if (bump && (version || resumeVersion))
    throw new Error("An explicit version cannot also request a bump");
  if (bump && !["patch", "minor", "major"].includes(bump))
    throw new Error("Invalid bump: use patch, minor or major");
  const stableTags = [...new Set(tags)].filter(
    (tag) => tag.startsWith("v") && stablePattern.test(tag.slice(1)),
  );
  stableTags.sort((a, b) => compareStable(a.slice(1), b.slice(1)));
  const latestTag = stableTags.at(-1) ?? null;
  const explicit = version || resumeVersion;
  if (explicit) {
    if (!versionPattern.test(explicit))
      throw new Error("Invalid explicit version");
    return {
      version: explicit,
      tag: `v${explicit}`,
      latestTag,
      reason: resumeVersion ? "resume" : "explicit",
    };
  }
  if (!stablePattern.test(current))
    throw new Error(
      "A prerelease VERSION requires an explicit or resume version",
    );
  const latest = latestTag?.slice(1);
  if (!bump && (!latest || compareStable(current, latest) > 0)) {
    return {
      version: current,
      tag: `v${current}`,
      latestTag,
      reason: latest ? "prepared" : "initial",
    };
  }
  const base = latest && compareStable(latest, current) > 0 ? latest : current;
  const index = { major: 0, minor: 1, patch: 2 }[bump || "patch"];
  const parts = base.split(".").map(BigInt);
  parts[index] += 1n;
  const selected = parts
    .map((part, offset) => (offset > index ? 0n : part))
    .join(".");
  return {
    version: selected,
    tag: `v${selected}`,
    latestTag,
    reason: bump || "patch",
  };
}

export function readRemoteTags(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^[a-f0-9]{40,64}\s+refs\/tags\/(v\S+)$/);
      if (!match) throw new Error("Invalid remote tag response");
      return match[1];
    })
    .filter((tag) => !tag.endsWith("^{}"));
}

export function chooseReleaseVersion({
  root = process.cwd(),
  remote = "origin",
  run = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim(),
  ...options
} = {}) {
  if (!remote || remote.startsWith("-")) throw new Error("Invalid remote");
  const current = readFileSync(resolve(root, "VERSION"), "utf8").trim();
  const tags = readRemoteTags(
    run(["ls-remote", "--tags", remote, "refs/tags/v*"]),
  );
  return selectReleaseVersion({ current, tags, ...options });
}

export function parseOptions(args) {
  const names = new Map([
    ["--remote", "remote"],
    ["--version", "version"],
    ["--resume-version", "resumeVersion"],
    ["--bump", "bump"],
  ]);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = names.get(args[index]);
    const value = args[index + 1];
    if (
      !name ||
      !value ||
      value.startsWith("--") ||
      Object.hasOwn(options, name)
    )
      throw new Error("Invalid or duplicate release option");
    options[name] = value;
  }
  return options;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    console.log(
      JSON.stringify(
        chooseReleaseVersion(parseOptions(process.argv.slice(2))),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
