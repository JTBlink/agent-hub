import { repositoryRoot } from "../shared/paths.mjs";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = repositoryRoot;
const siteUrl = new URL(
  JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"))
    .homepage,
);
const outputPath = resolve(root, process.argv[2] ?? "_site/index.html");
const version = readFileSync(resolve(root, "VERSION"), "utf8").trim();
const template = readFileSync(resolve(root, "homepage/index.html"), "utf8");

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid application version: ${version}`);
}

const structuredData = JSON.parse(
  readFileSync(resolve(root, "homepage/structured-data.json"), "utf8"),
);
const output = template
  .replaceAll("__APP_VERSION__", version)
  .replace(
    "__APP_SCHEMA__",
    JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
  );
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output);
const outputDirectory = dirname(outputPath);
const assetsDirectory = resolve(outputDirectory, "assets");
writeFileSync(
  resolve(outputDirectory, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${new URL("sitemap-pages.xml", siteUrl).href}</loc></sitemap><sitemap><loc>${new URL("docs/sitemap.xml", siteUrl).href}</loc></sitemap></sitemapindex>
`,
);
writeFileSync(
  resolve(outputDirectory, "sitemap-pages.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl.href}</loc></url></urlset>
`,
);
mkdirSync(resolve(assetsDirectory, "agent-icons"), { recursive: true });
for (const file of ["styles.css", "preview.js", "release.js"]) {
  copyFileSync(resolve(root, "homepage", file), resolve(outputDirectory, file));
}
copyFileSync(
  resolve(root, "src-tauri/icons/app-icon.svg"),
  resolve(assetsDirectory, "app-icon.svg"),
);
for (const file of [
  "skill-library.png",
  "dashboard.png",
  "project-workspace.png",
  "git.png",
  "tasks.png",
  "automation.png",
]) {
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
