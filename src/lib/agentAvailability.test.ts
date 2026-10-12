import { expect, it } from "vitest";
import {
  enabledInstalledAgents,
  isEnabledInstalledAgent,
} from "./agentAvailability";

it.each([
  [true, true, true],
  [true, false, false],
  [false, true, false],
  [false, false, false],
])(
  "installed=%s and enabled=%s yields availability=%s",
  (installed, enabled, expected) => {
    expect(isEnabledInstalledAgent({ installed, enabled })).toBe(expected);
  },
);

it("filters without changing order, records or the input collection", () => {
  const agents = [
    { key: "first", installed: true, enabled: true },
    { key: "disabled", installed: true, enabled: false },
    { key: "last", installed: true, enabled: true },
  ];
  const selected = enabledInstalledAgents(agents);
  expect(selected.map((agent) => agent.key)).toEqual(["first", "last"]);
  expect(selected[0]).toBe(agents[0]);
  expect(selected[1]).toBe(agents[2]);
  expect(agents).toHaveLength(3);
});
