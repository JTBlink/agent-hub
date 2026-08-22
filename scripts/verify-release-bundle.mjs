import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_INSTALLERS = [".exe", ".msi", ".dmg", ".AppImage", ".deb"];
const REQUIRED_METADATA = [
  "CHANGELOG.md",
  "PLATFORM_SUPPORT.md",
  "RELEASE_NOTES.md",
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function bundlePath(root, bundleDirectory, relativePath) {
  const bundle = resolve(root, bundleDirectory);
  const candidate = resolve(bundle, relativePath);
  const boundary = `${bundle}${sep}`;
  if (candidate !== bundle && !candidate.startsWith(boundary)) {
    throw new Error(`Unsafe checksum path: ${relativePath}`);
  }
  return candidate;
}

export function verifyReleaseBundle({
  root = process.cwd(),
  bundleDirectory,
} = {}) {
  if (!bundleDirectory) {
    throw new Error("bundleDirectory is required");
  }

  const bundle = resolve(root, bundleDirectory);
  const checksumPath = join(bundle, "SHA256SUMS");
  if (!existsSync(checksumPath)) {
    throw new Error("Missing SHA256SUMS");
  }

  const lines = readFileSync(checksumPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("SHA256SUMS is empty");
  }

  const verified = new Set();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) {
      throw new Error(`Invalid checksum line: ${line}`);
    }
    const [, expected, listedPath] = match;
    const relativePath = listedPath.replace(/^\.\//, "");
    if (
      isAbsolute(relativePath) ||
      relativePath.includes("\0") ||
      relativePath.includes("\\")
    ) {
      throw new Error(`Unsafe checksum path: ${listedPath}`);
    }
    if (verified.has(relativePath)) {
      throw new Error(`Duplicate checksum path: ${listedPath}`);
    }
    const file = bundlePath(root, bundleDirectory, relativePath);
    if (!existsSync(file) || !statSync(file).isFile()) {
      throw new Error(`Missing checksum file: ${listedPath}`);
    }
    const actual = sha256(file);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch: ${listedPath}`);
    }
    verified.add(relativePath);
  }

  const missingInstallers = REQUIRED_INSTALLERS.filter(
    (extension) =>
      ![...verified].some((path) => basename(path).endsWith(extension)),
  );
  if (missingInstallers.length > 0) {
    throw new Error(
      `Missing required installer formats: ${missingInstallers.join(", ")}`,
    );
  }
  const nestedInstallers = [...verified].filter(
    (path) =>
      REQUIRED_INSTALLERS.some((extension) =>
        basename(path).endsWith(extension),
      ) && path.includes("/"),
  );
  if (nestedInstallers.length > 0) {
    throw new Error(
      `Installers must be at bundle root: ${nestedInstallers.join(", ")}`,
    );
  }
  const missingMetadata = REQUIRED_METADATA.filter(
    (file) => !verified.has(file),
  );
  if (missingMetadata.length > 0) {
    throw new Error(`Missing required metadata: ${missingMetadata.join(", ")}`);
  }

  return {
    installers: REQUIRED_INSTALLERS.length,
    verifiedFiles: lines.length,
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const result = verifyReleaseBundle({ bundleDirectory: process.argv[2] });
    console.log(
      `Verified ${result.installers} installers and ${result.verifiedFiles} checksummed files`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
