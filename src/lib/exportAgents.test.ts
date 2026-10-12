import { expect, it } from "vitest";
import {
  detectedProjectAgentFilters,
  getDefaultExportAgents,
  projectInstallationTargets,
} from "./exportAgents";
import type { ProjectAgentTarget } from "./tauri";

const targets: ProjectAgentTarget[] = [
  {
    key: "claude_code",
    display_name: "Claude Code",
    enabled: true,
    installed: true,
    is_custom: false,
  },
  {
    key: "codex",
    display_name: "Codex",
    enabled: true,
    installed: true,
    is_custom: false,
  },
  {
    key: "cursor",
    display_name: "Cursor",
    enabled: true,
    installed: false,
    is_custom: false,
  },
];

it("uses personal enabled tools instead of the all-supported project target flags", () => {
  const available = projectInstallationTargets(targets, [
    { key: "claude_code", installed: true, enabled: true },
    { key: "codex", installed: true, enabled: false },
    { key: "cursor", installed: false, enabled: true },
  ]);
  expect(available.map((target) => target.key)).toEqual(["claude_code"]);
  expect(getDefaultExportAgents(available)).toEqual(["claude_code"]);
});

it("does not invent a Claude target before targets load or when every Agent is disabled", () => {
  expect(
    projectInstallationTargets(
      [],
      [{ key: "claude_code", installed: true, enabled: true }],
    ),
  ).toEqual([]);
  expect(getDefaultExportAgents([{ ...targets[0], enabled: false }])).toEqual(
    [],
  );
  expect(projectInstallationTargets(targets, [])).toEqual([]);
});

it("keeps a linked workspace's dedicated target independent of personal settings", () => {
  expect(projectInstallationTargets([targets[0]], [], true)).toEqual([
    targets[0],
  ]);
});

it("only shows detected project agents in filters while retaining disabled installed agents", () => {
  expect(
    detectedProjectAgentFilters([
      {
        key: "claude_code",
        display_name: "Claude Code",
        installed: true,
        enabled: true,
        is_custom: false,
      },
      {
        key: "codex",
        display_name: "Codex",
        installed: true,
        enabled: false,
        is_custom: false,
      },
      {
        key: "cursor",
        display_name: "Cursor",
        installed: false,
        enabled: true,
        is_custom: false,
      },
    ]),
  ).toEqual([
    { key: "claude_code", displayName: "Claude Code" },
    { key: "codex", displayName: "Codex" },
  ]);
});
