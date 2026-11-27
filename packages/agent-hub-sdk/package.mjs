import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { repositoryRoot } from "../../scripts/shared/paths.mjs";

const sdkDirectory = new URL("./", import.meta.url);
const layout = JSON.parse(
  readFileSync(new URL("package-layout.json", sdkDirectory), "utf8"),
);
const directories = new Set(layout.directories);
const rootFiles = new Set(layout.rootFiles);

const [output, mode] = process.argv.slice(2);
if (
  !output?.endsWith(".tar.gz") ||
  (mode && mode !== "--working-tree") ||
  process.argv.length > 4
)
  throw new Error(
    "Usage: node packages/agent-hub-sdk/package.mjs <output.tar.gz> [--working-tree]",
  );
const archive = resolve(output);
const stem = archive.slice(0, -".tar.gz".length);
const stage = mkdtempSync(join(tmpdir(), "agenthub-sdk-"));
try {
  const root = join(stage, "agent-hub-sdk");
  const git = (...args) =>
    execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  if (!mode && git("status", "--porcelain"))
    throw new Error("Create release SDK archives from a clean checkout");
  const deleted = new Set(
    mode ? git("ls-files", "--deleted", "-z").split("\0") : [],
  );
  const tracked = git("ls-files", "-z")
    .split("\0")
    .filter(
      (path) =>
        !deleted.has(path) &&
        (rootFiles.has(path) || directories.has(path.split("/")[0])),
    );
  const files = new Set([...tracked, ...layout.sdkFiles]);
  for (const path of layout.requiredFiles) {
    if (!files.has(path)) throw new Error(`Missing SDK build input: ${path}`);
  }
  for (const path of files) {
    const source = join(repositoryRoot, path);
    if (!lstatSync(source).isFile())
      throw new Error(`SDK build input must be a regular file: ${path}`);
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  const readme = new URL("README.md", sdkDirectory);
  const revision = git("rev-parse", "HEAD").trim();
  const sdkVersion = readFileSync(
    new URL("VERSION", sdkDirectory),
    "utf8",
  ).trim();
  const appVersion = readFileSync(join(root, "VERSION"), "utf8").trim();
  const notes = [
    `# AgentHub SDK ${sdkVersion}`,
    "",
    `- SDK 版本 \`${sdkVersion}\``,
    `- 应用基础版本 \`${appVersion}\``,
    `- 源码提交 \`${revision}\``,
    mode ? "- 本地预览，包含工作区改动" : "- 从干净检出打包",
    "",
    "SDK 包含 React 工作台、Rust 宿主、CLI 和内置资源。产品可独立配置 GitHub、GitLab、Herdr 和云备份，并通过 `sidebarModules` 扩展侧栏和页面。",
    "",
    "解压后查阅 `README.md`、`CHANGELOG.md` 和 `LICENSE`。",
    "",
  ].join("\n");
  copyFileSync(join(root, "README.md"), join(root, "AGENTHUB.md"));
  copyFileSync(readme, join(root, "README.md"));
  writeFileSync(join(root, "SDK_VERSION"), sdkVersion + "\n");
  writeFileSync(join(root, "SDK_REVISION"), revision + "\n");
  writeFileSync(join(root, "RELEASE-NOTES.md"), notes);
  execFileSync("tar", ["-czf", archive, "-C", stage, "agent-hub-sdk"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const digest = createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex");
  copyFileSync(readme, `${stem}-README.md`);
  copyFileSync(new URL("install.mjs", sdkDirectory), `${stem}-install.mjs`);
  copyFileSync(
    new URL("build-product.mjs", sdkDirectory),
    `${stem}-build-product.mjs`,
  );
  writeFileSync(`${stem}-RELEASE-NOTES.md`, notes);
  writeFileSync(`${archive}.sha256`, `${digest}  ${basename(archive)}\n`);
  writeFileSync(
    `${stem}-manifest.json`,
    JSON.stringify(
      {
        version: sdkVersion,
        appVersion,
        revision,
        file: basename(archive),
        sha256: digest,
        preview: Boolean(mode),
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(archive + "\n");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
