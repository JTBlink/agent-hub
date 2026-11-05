import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { devProcesses } from "./stop-dev.mjs";

it("protects the current launch chain, other checkouts, installed apps and desktop agents", () => {
  const root = "/workspace/demo";
  const rows = [
    [10, 1, "node scripts/app/build.mjs dev", root],
    [11, 10, "node scripts/app/stop-dev.mjs", root],
    [20, 1, "node scripts/app/build.mjs dev", root],
    [21, 20, "cargo build --bin agent-hub-cli", `${root}/src-tauri`],
    [30, 1, "node scripts/app/build.mjs dev", "/workspace/other"],
    [40, 1, "/Applications/AgentHub.app/Contents/MacOS/agent-hub", root],
    [50, 1, "target/debug/agent-hub", `${root}/src-tauri`],
    [51, 50, "herdr daemon", root],
    [
      55,
      1,
      `${root}/src-tauri/target/debug/bundle/macos/AgentHub.app/Contents/MacOS/agent-hub`,
      "/",
    ],
    [60, 1, "node scripts/app/primary-app.mjs build", root],
    [70, 1, "node /workspace/demo/node_modules/.bin/vite", root],
    [71, 60, "node /workspace/demo/node_modules/.bin/vite build", root],
    [72, 1, "node /workspace/demo/node_modules/.bin/vite preview", root],
  ];
  const processes = rows.map(([pid, ppid, command]) => ({
    pid,
    ppid,
    command,
    stat: "S",
  }));
  const directories = new Map(rows.map(([pid, , , cwd]) => [pid, cwd]));
  expect(
    devProcesses(processes, directories, root, 11)
      .map((item) => item.pid)
      .sort(),
  ).toEqual([20, 21, 50, 55, 70]);
});

it.skipIf(process.platform === "win32")(
  "stops a real stale launcher, escalates SIGTERM and preserves another checkout",
  async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "agent-hub-dev-"));
    const children = [];
    try {
      for (const name of ["current checkout", "other"]) {
        const root = join(sandbox, name);
        mkdirSync(join(root, "scripts/app"), { recursive: true });
        writeFileSync(
          join(root, "scripts/app/build.mjs"),
          'process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 1000);',
        );
        const child = spawn(
          process.execPath,
          ["scripts/app/build.mjs", "dev"],
          { cwd: root },
        );
        children.push(child);
        await once(child.stdout, "data");
      }
      const moduleUrl = pathToFileURL(resolve("scripts/app/stop-dev.mjs")).href;
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { stopDev } from ${JSON.stringify(moduleUrl)}; stopDev({root: process.argv[1], graceMs: 100});`,
          join(sandbox, "current checkout"),
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const firstExit =
        children[0].exitCode !== null || children[0].signalCode
          ? [children[0].exitCode, children[0].signalCode]
          : await once(children[0], "exit");
      expect(firstExit[1]).toBe("SIGKILL");
      expect(() => process.kill(children[1].pid, 0)).not.toThrow();
      // A repeated restart also succeeds when no old instance remains.
      const again = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { stopDev } from ${JSON.stringify(moduleUrl)}; stopDev({root: process.argv[1]});`,
          join(sandbox, "current checkout"),
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      expect(again.status).toBe(0);
    } finally {
      for (const child of children) child.kill("SIGKILL");
      rmSync(sandbox, { recursive: true, force: true });
    }
  },
  15000,
);

it("stops managed preview browsers with their desktop while preserving Agent and ordinary browser children", () => {
  const root = "/workspace/demo";
  const desktop = {
    pid: 50,
    ppid: 1,
    stat: "S",
    command: "target/debug/agent-hub",
  };
  const preview = {
    pid: 51,
    ppid: 50,
    stat: "S",
    command:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --remote-debugging-port=0 --user-data-dir=/data/preview/profiles/default about:blank",
  };
  const agent = { pid: 52, ppid: 50, stat: "S", command: "herdr daemon" };
  const ordinary = {
    pid: 53,
    ppid: 50,
    stat: "S",
    command:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome https://example.invalid",
  };
  const other = { ...preview, pid: 54, ppid: 1 };
  expect(
    devProcesses(
      [desktop, preview, agent, ordinary, other],
      new Map([[50, `${root}/src-tauri`]]),
      root,
      999,
    ).map((item) => item.pid),
  ).toEqual([50, 51]);
});

it("restarts only the selected product while preserving other product launchers", () => {
  const root = "/workspace/demo";
  const commands = [
    "node scripts/app/build.mjs dev",
    "node scripts/app/build.mjs dev --product personal",
    `${root}/src-tauri/target/products/personal-0123456789ab/debug/agent-hub`,
    "node /workspace/demo/node_modules/.bin/vite --port 1421 --strictPort",
    "node /workspace/demo/node_modules/.bin/vite --port 1420 --strictPort",
  ];
  const processes = commands.map((command, index) => ({
    pid: index + 10,
    ppid: 1,
    stat: "S",
    command,
  }));
  const directories = new Map(processes.map((item) => [item.pid, root]));
  expect(
    devProcesses(processes, directories, root, 999).map((item) => item.pid),
  ).toEqual([10, 14]);
  expect(
    devProcesses(processes, directories, root, 999, {
      id: "personal",
      devPort: 1421,
    }).map((item) => item.pid),
  ).toEqual([11, 12, 13]);
});
