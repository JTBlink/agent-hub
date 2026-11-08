import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const icons = resolve(root, "src-tauri/icons");
const themes = ["dark", "light"];
const defaultTheme = "dark";

function writeChanged(path, data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (existsSync(path) && readFileSync(path).equals(bytes)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function runIcon(source, output, extra = []) {
  const result = spawnSync(
    process.execPath,
    ["scripts/app/primary-app.mjs", "icon", source, "-o", output, ...extra],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function exportTheme(theme) {
  const directory = resolve(icons, "variants", theme);
  const master = resolve(directory, "1024x1024.png");
  const png = readFileSync(master);
  if (
    png.length < 33 ||
    png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    png.readUInt32BE(16) !== 1024 ||
    png.readUInt32BE(20) !== 1024 ||
    png[24] !== 8 ||
    png[25] !== 6
  ) {
    throw new Error(
      `${theme} icon master must be a 1024 × 1024, 8-bit RGBA PNG`,
    );
  }
  // Keep the approved artwork intact; the SVG is a lossless bitmap wrapper.
  writeChanged(
    resolve(directory, "app-icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <title>AgentHub — three flowing ribbons</title>
  <!-- Lossless bitmap packaging of the approved design; not traced vector paths. -->
  <image width="1024" height="1024" href="data:image/png;base64,${png.toString("base64")}" />
</svg>
`,
  );
  runIcon(master, directory);
}

function syncTree(source, destination) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = resolve(source, entry.name);
    const to = resolve(destination, entry.name);
    if (entry.isDirectory()) syncTree(from, to);
    else if (entry.isFile()) writeChanged(to, readFileSync(from));
  }
}

for (const theme of themes) exportTheme(theme);

// macOS uses an adaptive monochrome silhouette instead of the colored tile.
const cache = resolve(root, "node_modules/.cache/agent-hub/icons");
mkdirSync(cache, { recursive: true });
runIcon(resolve(icons, "tray-template.svg"), cache, ["-p", "32"]);
for (const theme of themes) {
  writeChanged(
    resolve(icons, "variants", theme, "tray-template.png"),
    readFileSync(resolve(cache, "32x32.png")),
  );
}

// Existing application and website paths always resolve to the dark default.
syncTree(resolve(icons, "variants", defaultTheme), icons);
for (const name of ["app-icon.svg", "32x32.png", "128x128.png"]) {
  writeChanged(
    resolve(root, "public/icons", name),
    readFileSync(resolve(icons, name)),
  );
}
