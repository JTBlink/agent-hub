import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, process.argv[2] ?? "_site/index.html");
const version = readFileSync(resolve(root, "VERSION"), "utf8").trim();
const template = readFileSync(resolve(root, "homepage/index.html"), "utf8");

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid application version: ${version}`);
}

const output = template.replaceAll("__APP_VERSION__", version);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output);
const outputDirectory = dirname(outputPath);
const assetsDirectory = resolve(outputDirectory, "assets");
mkdirSync(resolve(assetsDirectory, "agent-icons"), { recursive: true });
for (const file of ["styles.css", "preview.js"]) {
  copyFileSync(resolve(root, "homepage", file), resolve(outputDirectory, file));
}
copyFileSync(
  resolve(root, "src-tauri/icons/app-icon.svg"),
  resolve(assetsDirectory, "app-icon.svg"),
);
for (const file of ["skill-library.png", "dashboard.png"]) {
  copyFileSync(
    resolve(root, "docs/images", file),
    resolve(assetsDirectory, file),
  );
}
for (const file of [
  "claude_code.svg",
  "codex.svg",
  "cursor.png",
  "opencode.png",
  "hermes.png",
]) {
  copyFileSync(
    resolve(root, "public/agent-icons", file),
    resolve(assetsDirectory, "agent-icons", file),
  );
}
console.log(`Built homepage for AgentHub ${version}: ${outputPath}`);
