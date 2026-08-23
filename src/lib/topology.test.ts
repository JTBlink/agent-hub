import { describe, expect, it } from "vitest";

import { createTopologyLayout } from "./topology";

describe("createTopologyLayout", () => {
  it("keeps three agents in the standard topology density", () => {
    const layout = createTopologyLayout(3);

    expect(layout.height).toBe(198);
    expect(layout.nodeHeight).toBe(50);
    expect(layout.gap).toBe(14);
    expect(layout.connections).toHaveLength(3);
    expect(layout.connections.map((connection) => connection.startY)).toEqual([
      35,
      99,
      163,
    ]);
  });

  it("grows and compacts the topology when more agents are present", () => {
    const layout = createTopologyLayout(6);

    expect(layout.height).toBe(324);
    expect(layout.nodeHeight).toBe(44);
    expect(layout.gap).toBe(8);
    expect(layout.connections).toHaveLength(6);
    expect(layout.connections[0].pulseY).toBeLessThan(
      layout.connections[5].pulseY,
    );
  });

  it("returns an empty stable layout when no agents are present", () => {
    expect(createTopologyLayout(0)).toEqual({
      connections: [],
      gap: 14,
      height: 198,
      nodeHeight: 50,
    });
  });
});
