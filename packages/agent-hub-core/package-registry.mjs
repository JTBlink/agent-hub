import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [input, output, mode] = process.argv.slice(2);
if (!input || !output || (mode && mode !== "--preview"))
  throw new Error(
    "Usage: node package-registry.mjs <sdk.tar.gz> <new-directory> [--preview]",
  );
const home = fileURLToPath(new URL("./", import.meta.url));
const source = resolve(input);
const root = resolve(output);
const version = readFileSync(join(home, "VERSION"), "utf8").trim();
const stem = `agent-hub-core-${version}`;
const meta = JSON.parse(
  readFileSync(join(dirname(source), `${stem}-manifest.json`), "utf8"),
);
const digest = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
if (
  meta.version !== version ||
  meta.file !== basename(source) ||
  meta.sha256 !== digest(source) ||
  meta.preview !== Boolean(mode)
)
  throw new Error("Invalid SDK registry candidate");
if (!mode)
  execFileSync(process.execPath, [
    join(home, "verify-release.mjs"),
    dirname(source),
    `sdk-v${version}`,
    meta.revision,
  ]);
mkdirSync(root);
const core = join(root, "agent-hub-core");
mkdirSync(core);
for (const path of [
  "Cargo.toml",
  "Cargo.lock",
  "LICENSE",
  "README.md",
  "build.rs",
  "src",
  "tests",
  "install.mjs",
  "build-product.mjs",
])
  cpSync(join(home, path), join(core, path), { recursive: true });

const tree = join(root, "source");
mkdirSync(tree);
const entries = execFileSync("tar", ["-tzf", source], { encoding: "utf8" })
  .trimEnd()
  .split("\n");
if (
  entries.some(
    (path) =>
      !path.startsWith("agent-hub-core/") ||
      /(?:^|\/)\.\.(?:\/|$)|\\/.test(path),
  ) ||
  execFileSync("tar", ["-tvzf", source], { encoding: "utf8" })
    .trimEnd()
    .split("\n")
    .some((entry) => !/^[-d]/.test(entry))
)
  throw new Error("Invalid SDK archive entries");
execFileSync("tar", ["-xzf", source, "-C", tree]);
const skip = [
  "docs/prototypes/",
  "docs/images/",
  "docs/reference/",
  "docs/adr/",
  "docs/plans/",
  "homepage/",
  "tests/",
  "docs-site/",
];
const icons = new Set([
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.icns",
  "icon.ico",
  "tray-template.png",
  "app-icon.svg",
]);
const production = entries.filter((entry) => {
  if (entry.endsWith("/")) return false;
  const path = entry.slice("agent-hub-core/".length);
  if (
    skip.some((prefix) => path.startsWith(prefix)) ||
    /\.test\.(mjs|tsx?)$/.test(path)
  )
    return false;
  for (const prefix of ["src-tauri/icons/", "products/agent-flow/icons/"]) {
    if (path.startsWith(prefix)) return icons.has(path.slice(prefix.length));
  }
  return true;
});
const fontEntries = production.filter((p) =>
  /^agent-hub-core\/(public\/fonts|src\/fonts\/terminal-icons\/assets)\//.test(
    p,
  ),
);
const fontSet = new Set(fontEntries);

function payload(name, files) {
  const crate = join(root, name);
  mkdirSync(join(crate, "src"), { recursive: true });
  cpSync(join(home, "LICENSE"), join(crate, "LICENSE"));
  const archive = join(crate, "payload.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", tree, ...files], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  writeFileSync(
    join(crate, "Cargo.toml"),
    `[package]\nname = "${name}"\nversion = "${version}"\nedition = "2021"\nlicense = "${name === "agent-hub-fonts" ? "MIT AND OFL-1.1" : "MIT"}"\nrepository = "https://github.com/JTBlink/agent-hub"\ndescription = "Versioned AgentHub SDK build resources"\ninclude = ["src/**", "payload.tar.gz", "LICENSE"]\n${mode ? "publish = false\n" : ""}`,
  );
  writeFileSync(
    join(crate, "src/lib.rs"),
    '//! Versioned SDK resources.\n\n/// Compressed resources supplied to the SDK build command.\npub static ARCHIVE: &[u8] = include_bytes!("../payload.tar.gz");\n',
  );
  return digest(archive);
}
const desktop = payload(
  "agent-hub-desktop",
  production.filter((p) => !fontSet.has(p)),
);
const fonts = payload("agent-hub-fonts", fontEntries);
const names = ["agent-hub-desktop", "agent-hub-fonts"];
let cargo = readFileSync(join(core, "Cargo.toml"), "utf8")
  .replace(
    'include = ["build.rs",',
    'include = ["registry-sdk.json", "build.rs",',
  )
  .replace(
    "[dependencies]\n",
    "[dependencies]\n" +
      names
        .map(
          (name) =>
            `${name} = { version = "=${version}", path = "../${name}", optional = true }\n`,
        )
        .join(""),
  )
  .replace(
    'sdk-cli = ["dep:tempfile"]',
    'sdk-cli = ["dep:tempfile", "dep:agent-hub-desktop", "dep:agent-hub-fonts"]',
  );
if (!mode) cargo = cargo.replace("publish = false\n", "");
writeFileSync(join(core, "Cargo.toml"), cargo);
writeFileSync(
  join(core, "registry-sdk.json"),
  JSON.stringify(
    {
      version,
      revision: meta.revision,
      sha256: desktop,
      fonts_sha256: fonts,
      repository: "https://github.com/JTBlink/agent-hub.git",
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  join(root, "Cargo.toml"),
  `[workspace]\nresolver = "2"\nmembers = ${JSON.stringify(["agent-hub-core", ...names])}\n`,
);
cpSync(join(core, "Cargo.lock"), join(root, "Cargo.lock"));
// Add the generated workspace members while retaining the SDK's locked dependencies.
execFileSync("cargo", ["update", "--offline", "--workspace"], {
  cwd: root,
  stdio: "inherit",
});
