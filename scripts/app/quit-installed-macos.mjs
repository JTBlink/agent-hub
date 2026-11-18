import { spawnSync } from "node:child_process";

const script = `
ObjC.import("AppKit");
function run(args) {
  var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(args[0]);
  var personalApplications = ObjC.unwrap($.NSHomeDirectory()) + "/Applications";
  var pids = [];
  for (var i = 0; i < apps.count; i++) {
    var app = apps.objectAtIndex(i);
    var bundle = app.bundleURL;
    if (!bundle || !ObjC.unwrap(bundle.path).endsWith(".app")) continue;
    var parent = ObjC.unwrap(bundle.URLByDeletingLastPathComponent.path);
    if (parent !== "/Applications" && parent !== personalApplications) continue;
    if (!app.terminate && !app.isTerminated) {
      throw new Error("System declined quit for PID " + app.processIdentifier);
    }
    pids.push(app.processIdentifier);
  }
  return JSON.stringify(pids);
}
`;

/** Request normal termination by bundle identity without launching an app. */
export function quitInstalledMacApp(identifier, runner = spawnSync) {
  const result = runner(
    "osascript",
    ["-l", "JavaScript", "-e", script, identifier],
    {
      encoding: "utf8",
      timeout: 10000,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `无法退出 AgentHub 安装版：${result.error?.message ?? result.stderr.trim()}`,
    );
  const pids = JSON.parse(result.stdout);
  if (
    !Array.isArray(pids) ||
    !pids.every((pid) => Number.isSafeInteger(pid) && pid > 0)
  )
    throw new Error("无法核实 AgentHub 安装版进程。");
  return pids;
}
