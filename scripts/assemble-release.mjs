import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  readdirSync,
  renameSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_INSTALLERS = [".exe", ".msi", ".dmg", ".AppImage", ".deb"];

function isInstaller(path) {
  return REQUIRED_INSTALLERS.some((extension) =>
    basename(path).endsWith(extension),
  );
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function changelogSection(changelog, buildRef) {
  const normalizedRef = buildRef.replace(/^refs\/tags\//, "");
  const version = normalizedRef.replace(/^v/, "");
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\][^\n]*$/gm)];
  const selected =
    headings.find((heading) => heading[1] === version) ??
    headings.find((heading) => heading[1] === "Unreleased");

  if (!selected || selected.index === undefined) {
    throw new Error(
      "CHANGELOG.md has no matching version or Unreleased section",
    );
  }

  const contentStart = selected.index + selected[0].length;
  const nextHeading = changelog.slice(contentStart).search(/^## /m);
  const contentEnd =
    nextHeading < 0 ? changelog.length : contentStart + nextHeading;
  return changelog.slice(contentStart, contentEnd).trim();
}

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

export async function assembleRelease({
  root = process.cwd(),
  outputDirectory,
  buildRef,
}) {
  if (!outputDirectory || !buildRef) {
    throw new Error("outputDirectory and buildRef are required");
  }

  const output = resolve(root, outputDirectory);
  const installers = listFiles(output);
  const missing = REQUIRED_INSTALLERS.filter(
    (extension) =>
      !installers.some((path) => basename(path).endsWith(extension)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required installer formats: ${missing.join(", ")}`,
    );
  }

  // Release assets are uploaded by basename. Flatten installer artifacts before
  // generating SHA256SUMS so the checksum file works beside downloaded assets.
  const installerPaths = installers.filter(isInstaller);
  const destinations = new Set();
  for (const installerPath of installerPaths) {
    const destination = join(output, basename(installerPath));
    if (
      destinations.has(destination) ||
      (existsSync(destination) && destination !== installerPath)
    ) {
      throw new Error(
        `Installer basename collision: ${basename(installerPath)}`,
      );
    }
    destinations.add(destination);
  }
  for (const installerPath of installerPaths) {
    const destination = join(output, basename(installerPath));
    if (destination !== installerPath) {
      renameSync(installerPath, destination);
    }
  }

  const changelogPath = resolve(root, "CHANGELOG.md");
  const platformSupportPath = resolve(
    root,
    "docs/development/platform-support.md",
  );
  const changelog = readFileSync(changelogPath, "utf8");
  const platformSupport = readFileSync(platformSupportPath, "utf8");
  const platformBody = platformSupport.replace(/^# [^\n]+\n+/, "").trim();
  const normalizedRef = buildRef.replace(/^refs\/tags\//, "");

  copyFileSync(changelogPath, join(output, "CHANGELOG.md"));
  copyFileSync(platformSupportPath, join(output, "PLATFORM_SUPPORT.md"));
  writeFileSync(
    join(output, "RELEASE_NOTES.md"),
    `# AgentHub ${normalizedRef}\n\n## 变更日志\n\n${changelogSection(changelog, normalizedRef)}\n\n## 平台支持\n\n${platformBody}\n`,
  );

  const checksumFiles = listFiles(output)
    .filter((path) => basename(path) !== "SHA256SUMS")
    .sort((left, right) => left.localeCompare(right, "en"));
  const checksumLines = [];
  for (const path of checksumFiles) {
    const relativePath = relative(output, path).split(sep).join("/");
    checksumLines.push(`${await sha256(path)}  ./${relativePath}`);
  }
  writeFileSync(join(output, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);

  return {
    installers: installerPaths.length,
    checksums: checksumLines.length,
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const result = await assembleRelease({
      outputDirectory: process.argv[2],
      buildRef: process.argv[3],
    });
    console.log(
      `Assembled ${result.installers} installers with ${result.checksums} checksums`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
