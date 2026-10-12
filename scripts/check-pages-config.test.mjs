import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = fileURLToPath(
  new URL("./check-pages-config.mjs", import.meta.url),
);

function runCheck(site, apiExitCode = 0) {
  const directory = mkdtempSync(join(tmpdir(), "agenthub-pages-check-"));
  try {
    const preload = join(directory, "mock-gh.cjs");
    writeFileSync(
      preload,
      `const assert = require('node:assert/strict');
require('node:child_process').execFileSync = (command, args) => {
  assert.equal(command, 'gh');
  assert.deepEqual(args, ['api', 'repos/example/agent-hub/pages']);
  if (${apiExitCode} !== 0) throw new Error('Pages API request failed');
  return ${JSON.stringify(JSON.stringify(site))};
};
require('node:module').syncBuiltinESMExports();
`,
    );
    return spawnSync(
      process.execPath,
      ["--require", preload, script, "example/agent-hub"],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

it("blocks the legacy main-root configuration that serves the desktop source", () => {
  const result = runCheck({
    build_type: "legacy",
    source: { branch: "main", path: "/" },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Settings > Pages");
  expect(result.stderr).toContain("desktop development entrypoint");
});

it("accepts Actions publishing even when old source metadata is retained", () => {
  const result = runCheck({
    build_type: "workflow",
    source: { branch: "main", path: "/" },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("publishing source verified");
});

it("does not treat missing Pages configuration as ready to deploy", () => {
  expect(runCheck({}).status).toBe(1);
});

it("fails when the Pages API request fails", () => {
  expect(runCheck({ build_type: "workflow" }, 1).status).toBe(1);
});
