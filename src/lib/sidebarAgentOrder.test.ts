// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { makeTool } from "../../tests/fixtures/workspace";
import {
  applyAgentOrder,
  readAgentOrder,
  reorderSidebarAgents,
} from "./sidebarAgentOrder";
import {
  agentWorkspacePath,
  installedWorkspaceAgents,
} from "./workspaceAgents";

afterEach(() => localStorage.clear());

it("appends assistants after coding agents and excludes unavailable agents", () => {
  const agents = installedWorkspaceAgents([
    makeTool("hermes", "lobster"),
    { ...makeTool("disabled"), enabled: false },
    makeTool("codex"),
    { ...makeTool("absent", "lobster"), installed: false },
    makeTool("openclaw", "lobster"),
  ]);
  expect(agents.map((agent) => agent.key)).toEqual([
    "codex",
    "hermes",
    "openclaw",
  ]);
  expect(agents.map(agentWorkspacePath)).toEqual([
    "/global-workspace/codex",
    "/lobster-workspace/hermes",
    "/lobster-workspace/openclaw",
  ]);
});

it("keeps legacy category orders without duplicating agents and appends new agents", () => {
  const tools = [
    makeTool("codex"),
    makeTool("claude_code"),
    makeTool("opencode"),
  ];
  localStorage.setItem("order", '["claude_code","removed","codex","codex"]');
  expect(
    applyAgentOrder(tools, readAgentOrder("order")).map((tool) => tool.key),
  ).toEqual(["claude_code", "codex", "opencode"]);
});

it("ignores malformed saved orders", () => {
  for (const stored of ["broken", "null", "42", '{"codex":1}']) {
    localStorage.setItem("order", stored);
    expect(readAgentOrder("order")).toEqual([]);
  }
  localStorage.setItem("order", '["codex",42,null]');
  expect(readAgentOrder("order")).toEqual(["codex"]);
});

it("keeps assistants last even when dragging across categories", () => {
  const tools = [
    makeTool("codex"),
    makeTool("opencode"),
    makeTool("hermes", "lobster"),
    makeTool("openclaw", "lobster"),
  ];
  expect(reorderSidebarAgents(tools, 0, 3).map((tool) => tool.key)).toEqual([
    "opencode",
    "codex",
    "hermes",
    "openclaw",
  ]);
  expect(reorderSidebarAgents(tools, 3, 0).map((tool) => tool.key)).toEqual([
    "codex",
    "opencode",
    "openclaw",
    "hermes",
  ]);
});
