import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const packagePattern = /^agent-hub-([a-f0-9]{16})$/;
const objectPattern = /^(?:app_lib|agent_hub(?:_cli)?)(?:[.-]).*\.rcgu\.o$/;

export function cargoTargetDir(root = ROOT, env = process.env) {
  return resolve(root, env.CARGO_TARGET_DIR || "src-tauri/target");
}

function entries(directory) {
  if (!existsSync(directory)) return [];
  // Never follow directory links while finding disposable build artifacts.
  if (lstatSync(directory).isSymbolicLink()) return [];
  return readdirSync(directory, { withFileTypes: true });
}

function updatedSince(path, before) {
  const stat = lstatSync(path);
  if (stat.mtimeMs > before) return true;
  return (
    stat.isDirectory() &&
    entries(path).some((entry) => updatedSince(join(path, entry.name), before))
  );
}

/** Read ar member names without loading the (potentially very large) library. */
function archiveMembers(path) {
  if (!existsSync(path)) return null;
  const fd = openSync(path, "r");
  const read = (length, position) => {
    const buffer = Buffer.alloc(length);
    if (readSync(fd, buffer, 0, length, position) !== length)
      throw new Error(`Invalid archive: ${basename(path)}`);
    return buffer.toString();
  };
  const names = new Set();
  try {
    if (read(8, 0) !== "!<arch>\n") throw new Error("Invalid ar header");
    const length = lstatSync(path).size;
    let strings = "";
    for (let offset = 8; offset < length;) {
      const header = read(60, offset);
      const size = Number(header.slice(48, 58).trim());
      if (
        header.slice(58) !== "`\n" ||
        !Number.isSafeInteger(size) ||
        size < 0 ||
        offset + 60 + size > length
      )
        throw new Error("Invalid ar member");
      let name = header.slice(0, 16).trim();
      if (name.startsWith("#1/")) {
        const nameSize = Number(name.slice(3));
        if (
          !Number.isSafeInteger(nameSize) ||
          nameSize > size ||
          nameSize > 4096
        )
          throw new Error("Invalid ar member name");
        name = read(nameSize, offset + 60).replace(/\0+$/, "");
      } else if (name === "//") {
        if (size > 1024 * 1024) throw new Error("Oversized ar string table");
        strings = read(size, offset + 60);
      } else if (/^\/\d+$/.test(name)) {
        name = strings.slice(Number(name.slice(1))).split("/\n")[0];
      } else name = name.replace(/\/$/, "");
      names.add(name);
      offset += 60 + size + (size % 2);
    }
    return names;
  } finally {
    closeSync(fd);
  }
}

function fingerprints(profile) {
  const records = [];
  for (const entry of entries(join(profile, ".fingerprint"))) {
    const match = entry.isDirectory() && entry.name.match(packagePattern);
    if (!match) continue;
    const directory = join(profile, ".fingerprint", entry.name);
    for (const file of entries(directory)) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const path = join(directory, file.name);
      const data = JSON.parse(readFileSync(path, "utf8"));
      // Build-script output can be shared by multiple feature/target variants.
      // Leave those Cargo-managed directories intact.
      if (!/^(?:lib-|bin-|test-)/.test(file.name)) continue;
      const stamp = path.slice(0, -5);
      if (!existsSync(stamp)) continue;
      records.push({
        directory,
        hash: match[1],
        time: lstatSync(stamp).mtimeMs,
        key: JSON.stringify([
          file.name,
          data.profile,
          data.features,
          data.rustflags,
          data.config,
        ]),
      });
    }
  }
  const latest = new Map();
  for (const record of records) {
    if (!latest.has(record.key) || latest.get(record.key).time < record.time)
      latest.set(record.key, record);
  }
  return {
    records,
    retained: new Set([...latest.values()].map((r) => r.hash)),
  };
}

function pruneProfile(profile, remove) {
  const deps = join(profile, "deps");
  const { records, retained } = fingerprints(profile);
  const obsolete = new Set(
    records.filter((r) => !retained.has(r.hash)).map((r) => r.hash),
  );
  // A current rlib already contains the exact object list needed by the latest
  // library. Old compiler sessions otherwise leave thousands of loose copies.
  const members = archiveMembers(join(deps, "libapp_lib.rlib"));
  const files = entries(deps);
  const sessions = new Map();
  const objectSessions = new Map();
  for (const entry of files) {
    if (!entry.isFile()) continue;
    // Incremental test/binary objects include a unit and compiler-session ID.
    // Nonincremental codegen names do not match this shape.
    const match = entry.name.match(
      /^(app_lib|agent_hub(?:_cli)?)-([a-f0-9]{16})\.([a-z0-9]+)\.([a-z0-9]+)\.rcgu\.o$/,
    );
    if (!match) continue;
    const key = `${match[1]}-${match[2]}`;
    const session = match[4];
    const time = lstatSync(join(deps, entry.name)).mtimeMs;
    const latest = sessions.get(key);
    objectSessions.set(entry.name, { key, session });
    if (
      !latest ||
      time > latest.time ||
      (time === latest.time && session > latest.session)
    )
      sessions.set(key, { session, time });
  }
  for (const entry of files) {
    if (!entry.isFile()) continue;
    const path = join(deps, entry.name);
    const hash = entry.name.match(
      /^(?:lib)?(?:app_lib|agent_hub(?:_cli)?)-([a-f0-9]{16})(?:\.|$)/,
    )?.[1];
    const object = objectSessions.get(entry.name);
    if (hash && obsolete.has(hash)) remove(path);
    else if (object && sessions.get(object.key).session !== object.session)
      remove(path);
    else if (
      entry.name.startsWith("app_lib.") &&
      objectPattern.test(entry.name)
    ) {
      // Fail closed when the current archive is absent or unreadable.
      if (members && !members.has(entry.name)) remove(path);
    }
  }
  for (const record of records)
    if (obsolete.has(record.hash)) remove(record.directory);
}

// Preserve everything after the numeric version: installer suffixes such as
// -x64.msi or -1.aarch64.rpm are not semver prerelease identifiers.
const versionPattern = /\d+\.\d+\.\d+/;
const bundlePattern = /\.(?:dmg|exe|msi|AppImage|deb|rpm|app\.tar\.gz)$/;

function pruneBundles(directory, remove) {
  const groups = new Map();
  for (const entry of entries(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) pruneBundles(path, remove);
    else if (entry.isFile() && bundlePattern.test(entry.name)) {
      if (!versionPattern.test(entry.name)) continue;
      const key = entry.name.replace(versionPattern, "{version}");
      const group = groups.get(key) || [];
      group.push({ path, time: lstatSync(path).mtimeMs });
      groups.set(key, group);
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => b.time - a.time || a.path.localeCompare(b.path));
    for (const old of group.slice(1)) {
      remove(old.path);
      if (existsSync(`${old.path}.sig`)) remove(`${old.path}.sig`);
    }
  }
}

/** Keep the newest application artifacts per target/profile/feature variant. */
export function pruneBuildCache({
  targetDir = cargoTargetDir(),
  dryRun = false,
  before = Date.now(),
} = {}) {
  if (existsSync(targetDir) && lstatSync(targetDir).isSymbolicLink()) return [];
  const removed = new Set();
  const remove = (path) => {
    if (removed.has(path)) return;
    if (updatedSince(path, before)) return;
    removed.add(path);
  };
  const roots = [targetDir];
  for (const entry of entries(targetDir))
    if (
      entry.isDirectory() &&
      entry.name !== "debug" &&
      entry.name !== "release"
    )
      roots.push(join(targetDir, entry.name));
  for (const root of roots) {
    for (const name of ["debug", "release"]) {
      const profile = join(root, name);
      if (entries(profile).length === 0) continue;
      pruneProfile(profile, remove);
      pruneBundles(join(profile, "bundle"), remove);
    }
  }
  // Plan first: an unreadable archive/fingerprint must not cause a partial
  // cleanup. Never remove an entry updated since the invoking build started.
  const paths = [...removed].filter((path) => !updatedSince(path, before));
  if (!dryRun)
    for (const path of paths) rmSync(path, { recursive: true, force: true });
  return paths;
}

export function cleanupBuildCache(options) {
  try {
    const paths = pruneBuildCache(options);
    console.log(
      `构建缓存：${options?.dryRun ? "可清理" : "已清理"} ${paths.length} 项历史产物，保留最新构建和共享依赖。`,
    );
    return 0;
  } catch (error) {
    console.error(`构建缓存清理未完成：${error.message}`);
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) {
    console.error("用法：node scripts/build-cache.mjs [--dry-run]");
    process.exitCode = 1;
  } else
    process.exitCode = cleanupBuildCache({
      dryRun: args.includes("--dry-run"),
    });
}
