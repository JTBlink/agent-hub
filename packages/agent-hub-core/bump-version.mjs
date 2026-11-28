import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  selectReleaseVersion,
  readRemoteTags,
} from "../../scripts/release/select-release-version.mjs";
import { repositoryRoot } from "../../scripts/shared/paths.mjs";

const versionFile = new URL("./VERSION", import.meta.url);
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function chooseSdkVersion(current, remoteRefs, bump) {
  if (!stable.test(current)) throw new Error("Invalid stable SDK VERSION");
  if (bump && !["patch", "minor", "major"].includes(bump))
    throw new Error("Invalid SDK bump: use patch, minor or major");
  const tags = readRemoteTags(
    remoteRefs.replaceAll("refs/tags/sdk-v", "refs/tags/v"),
  );
  const prepared = selectReleaseVersion({ current, tags });
  const next =
    bump && prepared.reason === "patch"
      ? selectReleaseVersion({ current, tags, bump })
      : prepared;
  return {
    ...next,
    tag: `sdk-${next.tag}`,
    latestTag: next.latestTag ? `sdk-${next.latestTag}` : null,
  };
}

function readOptions(args) {
  let write = false;
  let bump;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--write" && !write) write = true;
    else if (flag === "--bump" && bump === undefined && args[index + 1])
      bump = args[++index];
    else
      throw new Error(
        "Usage: node packages/agent-hub-core/bump-version.mjs [--write] [--bump patch|minor|major]",
      );
  }
  return { write, bump };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const { write, bump } = readOptions(process.argv.slice(2));
    const current = readFileSync(versionFile, "utf8").trim();
    const run = (command, args) =>
      execFileSync(command, args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    const refs = run("git", [
      "ls-remote",
      "--tags",
      "origin",
      "refs/tags/sdk-v*",
    ]);
    const result = chooseSdkVersion(current, refs, bump);
    if (write && result.latestTag) {
      const publishedVersion = result.latestTag.slice("sdk-v".length);
      try {
        run("cargo", [
          "info",
          "--registry",
          "crates-io",
          `agent-hub-core@${publishedVersion}`,
        ]);
      } catch (error) {
        throw new Error(
          "Verify the latest SDK tag in crates.io before preparing another version",
          { cause: error },
        );
      }
    }
    if (write && current !== result.version)
      writeFileSync(versionFile, result.version + "\n");
    process.stdout.write(
      JSON.stringify(
        { ...result, written: write && current !== result.version },
        null,
        2,
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.stderr?.toString().trim() || error.message) + "\n",
    );
    process.exitCode = 1;
  }
}
