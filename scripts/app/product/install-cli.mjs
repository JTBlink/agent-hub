import { homedir } from "node:os";
import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  accessSync,
  constants,
} from "node:fs";
import { resolve, dirname, basename, relative, isAbsolute } from "node:path";
import { main as buildCli } from "../run-rust-cli.mjs";
import { loadProduct, productArguments } from "./config.mjs";

/** Update the PATH-facing development link after a successful build. */
export function linkDevelopmentCli(
  product,
  profile,
  {
    env = product.environment ?? process.env,
    replaceForeignSymlink = false,
  } = {},
) {
  const installDir =
    product.environment.AGENT_HUB_CLI_BIN_DIR ||
    resolve(env.CARGO_HOME || resolve(homedir(), ".cargo"), "bin");
  const name = `agent-hub-cli${process.platform === "win32" ? ".exe" : ""}`;
  const binary = resolve(product.targetDir, profile, name);
  const link = resolve(installDir, name);
  let metadata;
  try {
    metadata = lstatSync(link);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (metadata) {
    if (!metadata.isSymbolicLink())
      throw new Error("Refusing to replace an existing CLI file");
    const previous = resolve(dirname(link), readlinkSync(link));
    const scope = relative(product.targetDir, previous);
    if (
      !replaceForeignSymlink &&
      (!scope ||
        scope === ".." ||
        scope.startsWith("../") ||
        scope.startsWith("..\\") ||
        isAbsolute(scope) ||
        basename(previous) !== name)
    )
      throw new Error(
        "Refusing to replace a CLI link outside this product build directory",
      );
  }
  accessSync(binary, constants.X_OK);
  mkdirSync(installDir, { recursive: true });
  const staged = `${link}.staged-${process.pid}`;
  try {
    symlinkSync(binary, staged);
    renameSync(staged, link);
  } finally {
    rmSync(staged, { force: true });
  }
  console.error(`Installed ${product.id} development CLI: ${link}`);
  return link;
}

/** Install a development link without replacing another product or ordinary files. */
export function installDevelopmentCli(
  argv,
  { env = process.env, build = buildCli } = {},
) {
  const selected = productArguments(
    argv,
    env.AGENT_HUB_PRODUCT_CONFIG || env.AGENT_HUB_PRODUCT || "standard",
  );
  const profile = selected.args[0] ?? "debug";
  if (selected.args.length > 1 || !["debug", "release"].includes(profile))
    throw new Error("install --dev accepts debug or release and --product");
  const product = loadProduct(selected.selection, { env });
  const status = build(
    [
      "build",
      "--product",
      selected.selection,
      ...(profile === "release" ? ["--release"] : []),
    ],
    { env },
  );
  if (status !== 0) return status;
  linkDevelopmentCli(product, profile, { env });
  return 0;
}
