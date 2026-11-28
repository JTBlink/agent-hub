import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [archive, ...flags] = process.argv.slice(2);
const preview = flags.includes("--preview");
if (!archive || flags.some((flag) => !["--preview", "--native"].includes(flag)))
  throw new Error(
    "Usage: node smoke-registry.mjs <archive.tar.gz> [--preview] [--native]",
  );
const sdk = fileURLToPath(new URL("./", import.meta.url));
const stage = mkdtempSync(join(tmpdir(), "sdk-registry-smoke-"));
const run = (cmd, args, env = process.env) =>
  execFileSync(cmd, args, { stdio: "inherit", env });
try {
  const registry = join(stage, "registry");
  run(process.execPath, [
    join(sdk, "package-registry.mjs"),
    resolve(archive),
    registry,
    ...(preview ? ["--preview"] : []),
  ]);
  const manifest = join(registry, "Cargo.toml");
  const cargoEnv = {
    ...process.env,
    CARGO_TARGET_DIR: join(registry, "target"),
  };
  run(
    "cargo",
    [
      "build",
      "--locked",
      "--features",
      "sdk-cli",
      "--manifest-path",
      manifest,
      "--bin",
      "agent-hub-sdk",
    ],
    cargoEnv,
  );
  for (const crate of ["agent-hub-desktop", "agent-hub-fonts"]) {
    run(
      "cargo",
      ["package", "--locked", "--manifest-path", manifest, "-p", crate],
      cargoEnv,
    );
    const version = readFileSync(join(sdk, "VERSION"), "utf8").trim();
    const packed = join(
      registry,
      "target",
      "package",
      `${crate}-${version}.crate`,
    );
    const size = statSync(packed).size;
    if (size > 10_000_000)
      throw new Error(`${crate} exceeds crates.io package size limit`);
    process.stdout.write(`${crate}: ${size} bytes\n`);
  }
  const blocked = join(stage, "blocked");
  mkdirSync(blocked);
  const git = join(blocked, "git");
  writeFileSync(
    git,
    "#!/bin/sh\necho Git is disabled for SDK smoke >&2\nexit 71\n",
    { mode: 0o755 },
  );
  const cwd = join(stage, "downstream");
  mkdirSync(join(cwd, "custom"), { recursive: true });
  const manifestPath = join(cwd, "product.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      id: "agent-flow",
      productName: "Agent Flow",
      version: "1.2.0",
      features: ["gitlab", "herdr"],
      sidebarModules: { review: "custom/review.tsx" },
      sidebar: {
        primary: ["projects", "herdr", "review"],
        bottom: ["settings"],
        defaultPanel: "review",
      },
    }),
  );
  writeFileSync(
    join(cwd, "custom/review.tsx"),
    'import type { FeatureModule } from "@app/features";\nexport default { id:"review",sidebar:{id:"review",kind:"panel",labelKey:"Review",icon:()=>null,component:()=> <p>Review</p>}} satisfies FeatureModule;\n',
  );
  const installed = join(stage, "installed");
  const withoutGit = {
    ...process.env,
    GIT_ALLOW_PROTOCOL: "none",
    PATH: blocked + delimiter + process.env.PATH,
  };
  run(
    join(registry, "target/debug/agent-hub-sdk"),
    ["build", manifestPath, installed, "--frontend"],
    withoutGit,
  );
  const { loadProduct } = await import(
    pathToFileURL(join(installed, "packages/agent-hub-core/build/config.mjs"))
  );
  const build = loadProduct(manifestPath);
  const report = JSON.parse(
    readFileSync(join(build.frontendDist, "product-build.json"), "utf8"),
  );
  if (
    report.product_id !== "agent-flow" ||
    report.features.join(",") !== "gitlab,herdr" ||
    !report.modules.includes("custom/review.tsx")
  )
    throw new Error("Unexpected Agent Flow build identity or modules");
  if (flags.includes("--native")) {
    execFileSync(
      "cargo",
      [
        "check",
        "--locked",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--lib",
        "--bin",
        "agent-hub-cli",
        "--no-default-features",
        "--features",
        build.features.join(","),
      ],
      {
        cwd: installed,
        stdio: "inherit",
        env: {
          ...build.environment,
          ...withoutGit,
          CARGO_TARGET_DIR:
            process.env.SDK_SMOKE_CARGO_TARGET_DIR ||
            join(stage, "native-target"),
        },
      },
    );
  }
  process.stdout.write("Registry Agent Flow built without Git access\n");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
