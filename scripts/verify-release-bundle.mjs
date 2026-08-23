import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
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

function listBundleFiles(directory, root = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Release bundle must not contain symbolic links: ${relative(root, path)}`,
      );
    }
    if (entry.isDirectory()) {
      return listBundleFiles(path, root);
    }
    if (!entry.isFile()) {
      throw new Error(
        `Release bundle contains an unsupported entry: ${relative(root, path)}`,
      );
    }
    return [path];
  });
}

function packageVersion(root) {
  const path = resolve(root, "package.json");
  if (!existsSync(path)) return undefined;
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  return typeof manifest.version === "string" ? manifest.version : undefined;
}

function verifyReleaseMetadata(bundle) {
  const platformSupport = readFileSync(
    join(bundle, "PLATFORM_SUPPORT.md"),
    "utf8",
  );
  const releaseNotes = readFileSync(join(bundle, "RELEASE_NOTES.md"), "utf8");
  for (const platform of ["Windows", "macOS", "Linux"]) {
    if (
      !platformSupport.includes(platform) ||
      !releaseNotes.includes(platform)
    ) {
      throw new Error(
        `Release metadata is missing platform support: ${platform}`,
      );
    }
  }
  for (const section of ["应用数据目录", "已知限制"]) {
    if (!platformSupport.includes(section) || !releaseNotes.includes(section)) {
      throw new Error(
        `Release metadata is missing required section: ${section}`,
      );
    }
  }
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
  expectedVersion = packageVersion(root),
} = {}) {
  if (!bundleDirectory) {
    throw new Error("bundleDirectory is required");
  }

  const bundle = resolve(root, bundleDirectory);
  if (!existsSync(bundle) || !lstatSync(bundle).isDirectory()) {
    throw new Error("Release bundle directory does not exist");
  }
  const bundleFiles = listBundleFiles(bundle);
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
    if (!existsSync(file) || !lstatSync(file).isFile()) {
      throw new Error(`Missing checksum file: ${listedPath}`);
    }
    const actual = sha256(file);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch: ${listedPath}`);
    }
    verified.add(relativePath);
  }

  const unchecked = bundleFiles
    .map((path) => relative(bundle, path).split(sep).join("/"))
    .filter((path) => path !== "SHA256SUMS" && !verified.has(path));
  if (unchecked.length > 0) {
    throw new Error(`Files missing from SHA256SUMS: ${unchecked.join(", ")}`);
  }

  const installersByFormat = new Map(
    REQUIRED_INSTALLERS.map((extension) => [
      extension,
      [...verified].filter((path) => basename(path).endsWith(extension)),
    ]),
  );
  const invalidInstallerCounts = [...installersByFormat].filter(
    ([, paths]) => paths.length !== 1,
  );
  if (invalidInstallerCounts.length > 0) {
    throw new Error(
      `Expected exactly one installer per format: ${invalidInstallerCounts
        .map(([extension, paths]) => `${extension}=${paths.length}`)
        .join(", ")}`,
    );
  }
  const installers = [...installersByFormat.values()].flat();
  const nestedInstallers = installers.filter((path) => path.includes("/"));
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
  if (
    expectedVersion &&
    installers.some((path) => !basename(path).includes(`_${expectedVersion}_`))
  ) {
    throw new Error(
      `Installer filename version does not match ${expectedVersion}`,
    );
  }
  verifyReleaseMetadata(bundle);

  return {
    installers: installers.length,
    verifiedFiles: lines.length,
    version: expectedVersion,
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
