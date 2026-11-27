import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, readdirSync } from "node:fs";
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
      AGENT_HUB_BRIDGE_DIR: join(
        sdk,
        "node_modules",
        ".cache",
        "agent-hub-sdk",
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
