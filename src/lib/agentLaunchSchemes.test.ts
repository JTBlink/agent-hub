import { expect, it } from "vitest";
import {
  agentLaunchSchemes,
  selectedLaunchScheme,
  withAgentLaunchSchemes,
  type AgentLaunchSnapshot,
} from "./agentLaunchConfig";

it("derives one implicit default and dynamically resolves stable scheme references", () => {
  const snapshot: AgentLaunchSnapshot = {
    revision: "initial",
    document: { schema_version: 2, default_agent: "codex", schemes: {} },
    defaults: { codex: "codex --dangerously-bypass-approvals-and-sandbox" },
  };
  expect(agentLaunchSchemes(snapshot, "codex").items).toHaveLength(1);
  snapshot.document = withAgentLaunchSchemes(snapshot.document, "codex", {
    default_id: "custom",
    items: [
      { id: "default", name: "Automatic", instruction: "codex" },
      { id: "custom", name: "Custom", instruction: "codex-yolo" },
    ],
  });
  expect(selectedLaunchScheme(snapshot, "codex")?.instruction).toBe(
    "codex-yolo",
  );
  expect(selectedLaunchScheme(snapshot, "codex", "default")?.instruction).toBe(
    "codex",
  );
  snapshot.document.schemes!.codex.items.pop();
  expect(selectedLaunchScheme(snapshot, "codex", "custom")).toBeUndefined();
});

it("migrates untouched unknown legacy Agents when writing one Agent's schemes", () => {
  const document = withAgentLaunchSchemes(
    {
      schema_version: 1,
      default_agent: "codex",
      instructions: { future: "future-agent --continue" },
    },
    "codex",
    {
      default_id: "first",
      items: [{ id: "first", name: "Automatic", instruction: "codex-yolo" }],
    },
  );
  expect(document.schema_version).toBe(2);
  expect(document.instructions).toBeUndefined();
  expect(document.schemes?.future.items[0].instruction).toBe(
    "future-agent --continue",
  );
});
