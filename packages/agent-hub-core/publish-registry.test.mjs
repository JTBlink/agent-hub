import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it.skipIf(process.platform === "win32")(
  "publishes SDK dependencies before Core",
  () => {
    const root = mkdtempSync(join(tmpdir(), "sdk-publish-order-"));
    try {
      mkdirSync(join(root, "agent-hub-core"));
      writeFileSync(
        join(root, "agent-hub-core/registry-sdk.json"),
        '{"version":"0.2.0"}',
      );
      mkdirSync(join(root, "bin"));
      writeFileSync(
        join(root, "bin/cargo"),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CARGO_TEST_LOG"\n',
        { mode: 0o755 },
      );
      const preload = join(root, "mock.mjs");
      writeFileSync(
        preload,
        "globalThis.fetch = async () => new Response(null,{status:404});\n",
      );
      const log = join(root, "calls");
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          preload,
          fileURLToPath(new URL("publish-registry.mjs", import.meta.url)),
          root,
          "0.2.0",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            CARGO_REGISTRY_TOKEN: "test-placeholder",
            CARGO_TEST_LOG: log,
            PATH: join(root, "bin") + delimiter + process.env.PATH,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
        "publish --locked -p agent-hub-fonts",
        "publish --locked -p agent-hub-desktop",
        "publish --locked -p agent-hub-core --all-features",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
