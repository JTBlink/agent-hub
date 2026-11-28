import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it.skipIf(process.platform === "win32")(
  "stages a private plugin for native builds and rejects a wildcard webview",
  () => {
    const root = mkdtempSync(join(tmpdir(), "sdk-private-plugin-"));
    try {
      const write = (path, contents, options) => {
        const file = join(root, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, contents, options);
        return file;
      };
      const revision = "c".repeat(40);
      write("agent-hub-core/SDK_VERSION", "0.1.3\n");
      write("agent-hub-core/SDK_REVISION", revision + "\n");
      write(
        "agent-hub-core/src-tauri/Cargo.toml",
        '[package]\nname = "fixture-host"\nversion = "0.0.0"\nedition = "2021"\n[dependencies]\nagent-hub-core = { path = "../packages/agent-hub-core" }\n',
      );
      write("agent-hub-core/src-tauri/src/main.rs", "fn main() {}");
      write(
        "agent-hub-core/packages/agent-hub-core/Cargo.toml",
        '[package]\nname = "agent-hub-core"\nversion = "0.1.3"\nedition = "2021"\n',
      );
      write("agent-hub-core/packages/agent-hub-core/src/lib.rs", "");
      mkdirSync(join(root, "agent-hub-core/src-tauri/capabilities"));
      const archive = join(root, "sdk.tar.gz");
      execFileSync("tar", ["-czf", archive, "-C", root, "agent-hub-core"], {
        env: { ...process.env, COPYFILE_DISABLE: "1" },
      });
      const lock = write(
        "sdk-lock.json",
        JSON.stringify({
          source: archive,
          version: "0.1.3",
          revision,
          sha256: createHash("sha256")
            .update(readFileSync(archive))
            .digest("hex"),
        }),
      );
      write(
        "product/custom/fixture/Cargo.toml",
        '[package]\nname = "fixture-plugin"\nversion = "1.0.0"\nedition = "2021"\n[dependencies]\nagent-hub-core = "=0.1.3"\n',
      );
      write("product/custom/fixture/src/lib.rs", "pub fn init() {}");
      const capability = {
        identifier: "agenthub-private-plugin",
        webviews: ["main"],
        permissions: [],
      };
      const capabilityFile = write(
        "product/custom/capability.json",
        JSON.stringify(capability),
      );
      const manifest = write(
        "product/product.json",
        JSON.stringify({
          desktopPlugin: {
            package: "fixture-plugin",
            path: "custom/fixture",
            capability: "custom/capability.json",
          },
        }),
      );
      write(
        "tools/npm",
        '#!/bin/sh\nprintf "%s %s\\n" "$AGENT_HUB_DESKTOP_PLUGIN" "$*" >> "$PWD/invocations"\n',
        { mode: 0o700 },
      );

      const build = (name, ...options) =>
        spawnSync(
          process.execPath,
          [
            fileURLToPath(new URL("build-product.mjs", import.meta.url)),
            lock,
            manifest,
            join(root, name),
            ...options,
          ],
          {
            env: {
              ...process.env,
              PATH: join(root, "tools") + delimiter + process.env.PATH,
              CARGO_NET_OFFLINE: "true",
            },
            encoding: "utf8",
          },
        );
      const read = (path) => readFileSync(join(root, path), "utf8");

      const native = build("native");
      expect(native.status, native.stderr).toBe(0);
      expect(read("native/src-tauri/Cargo.toml")).toContain(
        "[dependencies.agent-hub-product-plugin]",
      );
      expect(read("native/src-tauri/Cargo.lock")).toContain(
        'name = "fixture-plugin"',
      );
      expect(
        read("native/src-tauri/Cargo.lock").match(/name = "agent-hub-core"/g),
      ).toHaveLength(1);
      expect(
        JSON.parse(
          read("native/src-tauri/capabilities/agenthub-private-plugin.json"),
        ),
      ).toEqual(capability);
      expect(read("native/invocations")).toContain("1 run app:build");

      const frontend = build("frontend", "--frontend");
      expect(frontend.status, frontend.stderr).toBe(0);
      expect(read("frontend/src-tauri/Cargo.toml")).not.toContain(
        "agent-hub-product-plugin",
      );
      expect(read("frontend/invocations")).toContain("\n run build");

      writeFileSync(
        capabilityFile,
        JSON.stringify({ ...capability, webviews: ["*"] }),
      );
      const rejected = build("rejected");
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain(
        "must target local main or workspace webviews",
      );
      expect(existsSync(join(root, "rejected"))).toBe(false);

      writeFileSync(
        manifest,
        JSON.stringify({
          desktopPlugin: {
            package: "fixture-plugin",
            path: "custom/../fixture",
          },
        }),
      );
      const outside = build("outside");
      expect(outside.status).not.toBe(0);
      expect(outside.stderr).toContain("must be relative to custom/");
      expect(existsSync(join(root, "outside"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  30_000,
);
