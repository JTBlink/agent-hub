import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repositoryRoot } from "../shared/paths.mjs";
import { loadProduct, productArguments } from "./product/config.mjs";

export function processSnapshot(runner = spawnSync) {
  const result = runner("ps", ["-axo", "pid=,ppid=,stat=,args="], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0)
    throw new Error("无法读取开发进程列表，停止启动。");
  return result.stdout.split("\n").flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    return match
      ? [{ pid: +match[1], ppid: +match[2], stat: match[3], command: match[4] }]
      : [];
  });
}

function isDesktop(command, root) {
  const productRoot = `${root}/src-tauri/target-products/`;
  if (command.startsWith(productRoot))
    return /^[^/]+\/(?:[^/]+\/)?debug\/(?:agent-hub|bundle\/macos\/[^/]+\.app\/Contents\/MacOS\/agent-hub)(?:\s|$)/.test(
      command.slice(productRoot.length),
    );
  const target = `${root}/src-tauri/target/`;
  return (
    (command.startsWith(target) &&
      /^(?:products\/[^/]+\/)?(?:[^/]+\/)?debug\/(?:agent-hub|bundle\/macos\/[^/]+\.app\/Contents\/MacOS\/agent-hub)(?:\s|$)/.test(
        command.slice(target.length),
      )) ||
    /^(?:\.\/)?(?:src-tauri\/)?target\/(?:[^/]+\/)?debug\/agent-hub(?:\s|$)/.test(
      command,
    )
  );
}

function isDevCommand(command, root) {
  const executable = command.split(/\s/)[0];
  return (
    isDesktop(command, root) ||
    /(?:^|[\/\s])scripts\/app\/(?:build|primary-app)\.mjs\s+dev(?:\s|$)/.test(
      command,
    ) ||
    /(?:^|\/)tauri(?:\.js)?\s+dev(?:\s|$)/.test(command) ||
    /^npm (?:run (?:app:dev|dev)|run tauri (?:-- )?dev)(?:\s|$)/.test(
      command,
    ) ||
    (/(?:^|\/)node(?:\s|$)/.test(executable) &&
      /\/(?:\.bin\/vite|vite\/bin\/vite\.js)(?:\s|$)/.test(command) &&
      !/\/(?:\.bin\/vite|vite\/bin\/vite\.js)\s+(?:build|preview|optimize)(?:\s|$)/.test(
        command,
      ))
  );
}

/** Product markers are explicit in launch args, staged paths or the dev port. */
function belongsToProduct(command, product) {
  const id = product?.id ?? "standard";
  const selected = command.match(/(?:^|\s)--product(?:=|\s+)([^\s]+)/)?.[1];
  if (selected)
    return (
      selected === id ||
      selected === product?.configPath ||
      selected === product?.environment?.AGENT_HUB_PRODUCT
    );
  const staged = command.match(
    /\/(?:products|target-products)\/([a-z][a-z0-9-]*)-[a-f0-9]{12}(?:\/|\s|$)/,
  )?.[1];
  if (staged) return staged === id;
  const port = command.match(/(?:^|\s)--port(?:=|\s+)(\d+)/)?.[1];
  if (port) return Number(port) === (product?.devPort ?? 1420);
  return id === "standard";
}

// Environment-only selection is visible on the explicitly marked child launchers.
// Never stop an unmarked ancestor belonging to another product's process tree.
function ownsDescendants(item, processes, product) {
  const queue = [item.pid];
  const seen = new Set(queue);
  for (let index = 0; index < queue.length; index++) {
    for (const child of processes) {
      if (child.ppid !== queue[index] || seen.has(child.pid)) continue;
      seen.add(child.pid);
      queue.push(child.pid);
      if (
        /(?:--product(?:=|\s)|\/(?:target-products|products)\/)/.test(
          child.command,
        ) &&
        !belongsToProduct(child.command, product)
      )
        return false;
    }
  }
  return true;
}

/** Select only this checkout's dev roots, protecting this invocation's ancestors. */
export function devProcesses(
  processes,
  cwdByPid,
  root,
  self = process.pid,
  product,
) {
  const protectedPids = new Set();
  let pid = self;
  while (pid && !protectedPids.has(pid)) {
    protectedPids.add(pid);
    pid = processes.find((item) => item.pid === pid)?.ppid;
  }
  const selected = processes.filter(
    (item) =>
      !protectedPids.has(item.pid) &&
      ownsDescendants(item, processes, product) &&
      !item.stat.startsWith("Z") &&
      belongsToProduct(item.command, product) &&
      ((isDesktop(item.command, root) && item.command.startsWith(`${root}/`)) ||
        ([root, resolve(root, "src-tauri")].includes(cwdByPid.get(item.pid)) &&
          isDevCommand(item.command, root))),
  );
  // Include build workers and managed preview browsers, but never traverse
  // from a desktop into its terminal Agents or ordinary browser processes.
  for (let index = 0; index < selected.length; index++) {
    const parent = selected[index];
    if (isDesktop(parent.command, root)) {
      // Preview Chromium owns persistent profile locks. Stop only direct children
      // launched with our managed-browser flags; terminal Agents remain untouched.
      for (const child of processes) {
        if (
          child.ppid === parent.pid &&
          /(?:^|\s)--headless=new(?:\s|$)/.test(child.command) &&
          /(?:^|\s)--remote-debugging-port=0(?:\s|$)/.test(child.command) &&
          /(?:^|\s)--user-data-dir=/.test(child.command) &&
          !selected.some((item) => item.pid === child.pid)
        )
          selected.push(child);
      }
      continue;
    }
    for (const child of processes) {
      if (
        child.ppid === parent.pid &&
        !protectedPids.has(child.pid) &&
        !selected.some((item) => item.pid === child.pid)
      )
        selected.push(child);
    }
  }
  return selected;
}

function workingDirectories(processes, root, runner) {
  const candidates = processes.filter((item) =>
    isDevCommand(item.command, root),
  );
  const directories = new Map();
  if (!candidates.length) return directories;
  const result = runner(
    "lsof",
    [
      "-a",
      "-p",
      candidates.map((item) => item.pid).join(","),
      "-d",
      "cwd",
      "-Fpn",
    ],
    { encoding: "utf8" },
  );
  // lsof returns 1 if the candidates have already exited.
  if (result.error || ![0, 1].includes(result.status))
    throw new Error("无法核实开发进程工作目录（需要 lsof），停止启动。");
  let pid;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    if (line.startsWith("n") && pid) directories.set(pid, line.slice(1));
  }
  return directories;
}

const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Stop launchers first so their watchers cannot respawn the old application. */
export function stopDev({
  root = resolve(repositoryRoot),
  runner = spawnSync,
  signal = process.kill,
  pause = sleep,
  graceMs = 3000,
  product,
} = {}) {
  root = realpathSync(root);
  const snapshot = processSnapshot(runner);
  const targets = devProcesses(
    snapshot,
    workingDirectories(snapshot, root, runner),
    root,
    process.pid,
    product,
  );
  if (!targets.length) return;
  console.log(`停止当前仓库的旧开发实例（${targets.length} 个进程）…`);
  const send = (items, value) => {
    for (const item of items) {
      try {
        signal(item.pid, value);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  };
  const remaining = () => {
    const current = processSnapshot(runner);
    return targets.filter((item) =>
      current.some(
        (active) =>
          active.pid === item.pid &&
          active.command === item.command &&
          !active.stat.startsWith("Z"),
      ),
    );
  };
  send(targets, "SIGTERM");
  const wait = (ms) => {
    const deadline = Date.now() + ms;
    let active = remaining();
    while (active.length && Date.now() < deadline) {
      pause(100);
      active = remaining();
    }
    return active;
  };
  const stubborn = wait(graceMs);
  if (stubborn.length) {
    send(stubborn, "SIGKILL");
    if (wait(1000).length) throw new Error("旧开发实例未退出，停止启动。");
  }
  console.log("旧开发实例已退出，启动新实例。");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    const { selection } = productArguments(process.argv.slice(2));
    stopDev({
      product: selection === "standard" ? undefined : loadProduct(selection),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
