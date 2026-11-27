import { resolve } from "node:path";
import { repositoryRoot } from "./paths.mjs";

export function cargoTargetDir(root = repositoryRoot, env = process.env) {
  return resolve(root, env.CARGO_TARGET_DIR || "src-tauri/target");
}
