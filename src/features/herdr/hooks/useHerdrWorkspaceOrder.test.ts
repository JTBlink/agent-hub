import { expect, it } from "vitest";
import {
  mergeHerdrWorkspaceOrder,
  parseHerdrWorkspaceOrders,
} from "./useHerdrWorkspaceOrder";

it("reads persisted workspace orders by session", () => {
  expect(
    parseHerdrWorkspaceOrders(
      JSON.stringify({ default: ["workspace-b", "workspace-a"] }),
    ),
  ).toEqual({ default: ["workspace-b", "workspace-a"] });
});

it("merges a reordered session with the latest persisted sessions", () => {
  expect(
    mergeHerdrWorkspaceOrder(
      JSON.stringify({ other: ["workspace-c"] }),
      "default",
      ["workspace-b", "workspace-a"],
    ),
  ).toEqual({
    other: ["workspace-c"],
    default: ["workspace-b", "workspace-a"],
  });
});

it("ignores malformed persisted workspace orders", () => {
  expect(parseHerdrWorkspaceOrders("not-json")).toEqual({});
  expect(
    parseHerdrWorkspaceOrders(
      JSON.stringify({ default: ["workspace-a", 2], broken: "workspace-b" }),
    ),
  ).toEqual({});
});
