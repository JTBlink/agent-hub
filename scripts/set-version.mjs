import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateVersions } from "./check-version.mjs";

const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function setVersions({ root = process.cwd(), version }) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  const packagePath = resolve(root, "package.json");
  const sourcePath = resolve(root, "VERSION");
  const lockfilePath = resolve(root, "package-lock.json");
  const tauriPath = resolve(root, "src-tauri/tauri.conf.json");
  const cargoPath = resolve(root, "src-tauri/Cargo.toml");
  const cargoLockPath = resolve(root, "src-tauri/Cargo.lock");

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
  const tauriConfig = JSON.parse(readFileSync(tauriPath, "utf8"));
  const cargoToml = readFileSync(cargoPath, "utf8");
  const cargoLock = readFileSync(cargoLockPath, "utf8");
  const packageStart = cargoToml.indexOf("[package]");
  const packageEnd = cargoToml.indexOf("[", packageStart + "[package]".length);

  if (packageStart < 0 || packageEnd < 0) {
    throw new Error(`Could not locate [package] section in ${cargoPath}`);
  }

  const beforePackage = cargoToml.slice(0, packageStart);
  const packageSection = cargoToml.slice(packageStart, packageEnd);
  const afterPackage = cargoToml.slice(packageEnd);
  const updatedPackage = packageSection.replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${version}"`,
  );

  if (updatedPackage === packageSection) {
    throw new Error(`Could not update package version in ${cargoPath}`);
  }

  const updatedCargoLock = cargoLock.replace(
    /(\[\[package\]\]\nname = "agent-hub"\nversion = )"[^"]+"/,
    `$1"${version}"`,
  );
  if (updatedCargoLock === cargoLock) {
    throw new Error(`Could not update agent-hub version in ${cargoLockPath}`);
  }

  packageJson.version = version;
  lockfile.version = version;
  if (lockfile.packages?.[""]) {
    lockfile.packages[""].version = version;
  }
  tauriConfig.version = version;

  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(sourcePath, `${version}\n`);
  writeFileSync(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`);
  writeFileSync(tauriPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);
  writeFileSync(cargoPath, beforePackage + updatedPackage + afterPackage);
  writeFileSync(cargoLockPath, updatedCargoLock);

  validateVersions({ root });
  return version;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  const version =
    process.argv[2] ??
    readFileSync(resolve(process.cwd(), "VERSION"), "utf8").trim();
  try {
    setVersions({ version });
    console.log(`Updated AgentHub to version ${version}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
