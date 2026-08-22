import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function readJsonVersion(path) {
  return JSON.parse(readFileSync(path, "utf8")).version;
}

function readCargoVersion(path) {
  const cargoToml = readFileSync(path, "utf8");
  const packageSection = cargoToml.split("[package]", 2)[1]?.split("[", 1)[0];
  const version = packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

  if (!version) {
    throw new Error(`Could not read package version from ${path}`);
  }

  return version;
}

function readPackageLockVersions(path) {
  const lockfile = JSON.parse(readFileSync(path, "utf8"));
  return {
    packageLock: lockfile.version,
    packageLockRoot: lockfile.packages?.[""]?.version,
  };
}

function readCargoLockVersion(path) {
  const cargoLock = readFileSync(path, "utf8");
  const version = cargoLock.match(
    /\[\[package\]\]\nname = "agent-hub"\nversion = "([^"]+)"/,
  )?.[1];

  if (!version) {
    throw new Error(`Could not read agent-hub version from ${path}`);
  }

  return version;
}

export function readVersions(root = process.cwd()) {
  return {
    package: readJsonVersion(resolve(root, "package.json")),
    ...readPackageLockVersions(resolve(root, "package-lock.json")),
    cargo: readCargoVersion(resolve(root, "src-tauri/Cargo.toml")),
    cargoLock: readCargoLockVersion(resolve(root, "src-tauri/Cargo.lock")),
    tauri: readJsonVersion(resolve(root, "src-tauri/tauri.conf.json")),
  };
}

export function validateVersions({ root = process.cwd(), tag = "" } = {}) {
  const versions = readVersions(root);
  const uniqueVersions = new Set(Object.values(versions));

  if (uniqueVersions.size !== 1) {
    throw new Error(
      `Version mismatch: package=${versions.package}, package-lock=${versions.packageLock}, package-lock-root=${versions.packageLockRoot}, cargo=${versions.cargo}, cargo-lock=${versions.cargoLock}, tauri=${versions.tauri}`,
    );
  }

  const version = versions.package;
  if (tag) {
    const tagVersion = tag.startsWith("v") ? tag.slice(1) : tag;
    if (tagVersion !== version) {
      throw new Error(
        `Tag ${tagVersion} does not match application version ${version}`,
      );
    }
  }

  return version;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const version = validateVersions({ tag: process.argv[2] ?? "" });
    console.log(`Validated AgentHub version ${version}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
