import { expect, it } from "vitest";
import { createSession, openPreview } from "./session";
import { reconcileInventory } from "./inventory";
it("maps a pending native creation to its existing owner without opening a duplicate tab", () => {
  const session = openPreview(createSession(), {
    kind: "web",
    address: "about:blank",
    title: "New",
    id: "gui-tab",
  });
  const page = {
    id: "native-page",
    owner: "gui-tab",
    url: "about:blank",
    title: "New",
    profile: "default",
    revision: "loader",
  };
  const result = reconcileInventory(session, {}, [page], {}, new Set());
  expect(result.state.tabs).toHaveLength(1);
  expect(result.mapping).toEqual({ "gui-tab": "native-page" });
  expect(
    reconcileInventory(createSession(), {}, [page], {}, new Set()).state.tabs,
  ).toHaveLength(0);
});
