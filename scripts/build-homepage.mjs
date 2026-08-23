import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
console.log(`Built homepage for AgentHub ${version}: ${outputPath}`);
