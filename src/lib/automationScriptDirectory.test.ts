import { expect, it } from "vitest";
import { externalAutomationScriptDirectory } from "./automationScriptDirectory";

it.each([
  [
    "'/workspace/Application Support/tasks/start.sh'",
    "/workspace/project",
    "/workspace/Application Support/tasks",
  ],
  [
    'sh "/workspace/task scripts/start.sh" --check',
    null,
    "/workspace/task scripts",
  ],
  ["'/bin/bash' '/workspace/start.sh'", null, "/workspace"],
  [
    "python3 './scripts/check.py'",
    "/workspace/project",
    "/workspace/project/./scripts",
  ],
  ["'~/tasks/start.sh'", null, "~/tasks"],
  ["& 'C:\\tasks\\start.ps1'", null, "C:/tasks"],
  ["'C:\\start.cmd'", null, "C:/"],
  ["'/start.sh'", null, "/"],
  ["printf test", "/workspace/project", null],
  ["sh -c 'echo hello'", "/workspace/project", null],
  ["sh '$SCRIPT/start.sh'", null, null],
  ['sh "$HOME/tasks/start.sh"', "/workspace/project", null],
  ["sh ./start.sh", null, null],
  ["'unclosed/start.sh", "/workspace/project", null],
])("resolves literal script directories: %s", (command, workdir, expected) => {
  expect(externalAutomationScriptDirectory(command, workdir)).toBe(expected);
});
