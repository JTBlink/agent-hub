import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [lockFile, productFile, destination, ...options] = process.argv.slice(2);
const frontend = options.length === 1 && options[0] === "--frontend";
const desktopArgs = options[0] === "--" ? options.slice(1) : [];
if (
  !lockFile ||
  !productFile ||
  !destination ||
  (options.length && !frontend && options[0] !== "--")
)
  throw new Error(
    "Usage: node build-product.mjs <sdk-lock.json> <product.json> <new-sdk-directory> [--frontend | -- <desktop build args>]",
  );

const manifest = resolve(productFile);
const sdk = resolve(destination);
const custom = join(dirname(manifest), "custom");
const desktopPlugin = JSON.parse(readFileSync(manifest, "utf8")).desktopPlugin;

function checkCustomDirectory(path) {
  if (!lstatSync(path).isDirectory())
    throw new Error("Product custom resources must use a regular directory");
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) checkCustomDirectory(join(path, entry.name));
    else if (!entry.isFile())
      throw new Error("Product custom resources must be regular files");
  }
}
if (existsSync(custom)) checkCustomDirectory(custom);

function customPath(path) {
  if (
    typeof path !== "string" ||
    !path.startsWith("custom/") ||
    path.includes("\\") ||
    path.includes(":") ||
    Array.from(path).some((character) => character < " ") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Desktop plugin paths must be relative to custom/");
  return path;
}

if (desktopPlugin !== undefined) {
  if (
    !desktopPlugin ||
    typeof desktopPlugin !== "object" ||
    Array.isArray(desktopPlugin) ||
    typeof desktopPlugin.package !== "string" ||
    !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(desktopPlugin.package)
  )
    throw new Error("Desktop plugin requires a Cargo package name and path");
  if (
    !existsSync(
      join(dirname(manifest), customPath(desktopPlugin.path), "Cargo.toml"),
    )
  )
    throw new Error("Desktop plugin Cargo.toml is missing");
  if (desktopPlugin.capability !== undefined) {
    const source = join(
      dirname(manifest),
      customPath(desktopPlugin.capability),
    );
    if (!lstatSync(source).isFile())
      throw new Error("Desktop plugin capability must be a JSON file");
    const capability = JSON.parse(readFileSync(source, "utf8"));
    if (capability?.identifier !== "agenthub-private-plugin")
      throw new Error(
        "Desktop plugin capability must use the agenthub-private-plugin identifier",
      );
    if (
      !Array.isArray(capability.webviews) ||
      !capability.webviews.length ||
      capability.webviews.some(
        (view) => !["main", "workspace-*"].includes(view),
      ) ||
      capability.windows !== undefined ||
      capability.remote !== undefined
    )
      throw new Error(
        "Desktop plugin capabilities must target local main or workspace webviews",
      );
  }
}

execFileSync(
  process.execPath,
  [
    fileURLToPath(import.meta.url).replace(
      /build-product\.mjs$/,
      "install.mjs",
    ),
    resolve(lockFile),
    sdk,
  ],
  { stdio: "inherit" },
);
if (existsSync(custom))
  cpSync(custom, join(sdk, "custom"), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });

if (desktopPlugin && !frontend) {
  const host = join(sdk, "src-tauri");
  appendFileSync(
    join(host, "Cargo.toml"),
    `\n[dependencies.agent-hub-product-plugin]\npackage = ${JSON.stringify(desktopPlugin.package)}\npath = ${JSON.stringify(`../${desktopPlugin.path}`)}\n\n[patch.crates-io]\nagent-hub-core = { path = "../packages/agent-hub-core" }\n`,
  );
  if (desktopPlugin.capability !== undefined)
    cpSync(
      join(sdk, desktopPlugin.capability),
      join(host, "capabilities", "agenthub-private-plugin.json"),
      { force: false, errorOnExist: true },
    );
  // Resolve the new path dependency before the SDK's locked native build.
  execFileSync(
    "cargo",
    ["update", "--workspace", "--manifest-path", join(host, "Cargo.toml")],
    { cwd: sdk, stdio: "inherit" },
  );
  // Tauri managed state is keyed by Rust type identity. Both sides must use the
  // exact Core instance supplied by the SDK, including when the plugin pins a
  // registry or Git version.
  const corePackages = readFileSync(join(host, "Cargo.lock"), "utf8")
    .split("[[package]]")
    .filter((entry) => /^\s*name = "agent-hub-core"\r?\n/.test(entry));
  if (corePackages.length !== 1 || /^source = /m.test(corePackages[0]))
    throw new Error(
      "Desktop plugin must use the SDK's agent-hub-core instance",
    );
}

const npm = process.platform === "win32" ? process.execPath : "npm";
const npmArguments =
  process.platform === "win32"
    ? [
        join(
          dirname(process.execPath),
          "node_modules",
          "npm",
          "bin",
          "npm-cli.js",
        ),
      ]
    : [];
const invoke = (args) =>
  execFileSync(npm, [...npmArguments, ...args], {
    cwd: sdk,
    stdio: "inherit",
    env: {
      ...process.env,
      AGENT_HUB_DESKTOP_PLUGIN: desktopPlugin && !frontend ? "1" : "",
      AGENT_HUB_BRIDGE_DIR: join(
        sdk,
        "node_modules",
        ".cache",
        "agent-hub-core",
        "cli-bridge",
      ),
    },
  });
invoke(["ci", "--no-audit", "--no-fund"]);
invoke([
  "run",
  frontend ? "build" : "app:build",
  "--",
  "--product",
  manifest,
  ...desktopArgs,
]);
