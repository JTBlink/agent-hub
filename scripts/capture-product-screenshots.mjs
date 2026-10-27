// Capture only the synthetic local product fixture in an isolated browser profile.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.AGENT_HUB_SCREENSHOT_BROWSER,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  path.join(
    process.env.PROGRAMFILES || "C:/Program Files",
    "Google/Chrome/Application/chrome.exe",
  ),
].filter(Boolean);
const browser = candidates.find((candidate) => fs.existsSync(candidate));
if (!browser)
  throw new Error("Set AGENT_HUB_SCREENSHOT_BROWSER to a Chromium executable.");
const origin = process.env.AGENT_HUB_PREVIEW_ORIGIN || "http://localhost:1420";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname))
  throw new Error("Screenshots require a local synthetic preview.");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agent-hub-docs-"));
const shots = [
  ["dashboard.png", "&undeployed&ungrouped"],
  ["skill-library.png", "&undeployed&ungrouped"],
  ["automation.png", ""],
  ["automation-create.png", "&automation-state=editor"],
  ["automation-detail.png", "&task=hermes%3Aaudit"],
  [
    "automation-execution.png",
    "&task=agent_hub%3A11111111-1111-4111-8111-111111111111&automation-state=execution",
  ],
  [
    "automation-run-output.png",
    "&task=agent_hub%3A11111111-1111-4111-8111-111111111111&automation-state=execution-output",
  ],
  ["automation-templates.png", "&automation-state=templates"],
  ["automation-menu.png", "&automation-state=menu"],
];
try {
  for (const [name, query] of shots) {
    const target = path.join(root, "docs/images", name);
    const view =
      name === "dashboard.png"
        ? "dashboard"
        : name === "skill-library.png"
          ? "skills"
          : "automation";
    const result = spawnSync(
      browser,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--password-store=basic",
        "--use-mock-keychain",
        `--user-data-dir=${path.join(temporary, name)}`,
        "--window-size=1440,900",
        "--force-device-scale-factor=1",
        "--virtual-time-budget=4000",
        `--screenshot=${target}`,
        `${origin}/tests/browser/product-preview.html?view=${view}&theme=dark&language=zh&capture${query}`,
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    if (result.status !== 0 || !fs.existsSync(target))
      throw new Error(
        `Capture failed for ${name}: ${result.error?.message || result.stderr.slice(-1000)}`,
      );
    console.log(`Captured docs/images/${name}`);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
