// @vitest-environment jsdom
import { act, type ComponentProps, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TerminalTabPanes } from "./TerminalTabPanes";
import type { PaneControl } from "./TerminalPane";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./TerminalPane", () => ({
  TerminalPane: ({
    visible,
    active,
    projectId,
  }: {
    visible: boolean;
    active: boolean;
    projectId: string;
  }) => (
    <span data-testid={projectId} data-visible={visible} data-active={active} />
  ),
}));

it("suspends covered panes on zoom and restores them without removing panes", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  const root = createRoot(host);
  const controls = createRef<Map<string, PaneControl>>();
  controls.current = new Map();
  const target = createRef<PaneControl | null>();
  const tab: ComponentProps<typeof TerminalTabPanes>["tab"] = {
    id: "tab",
    projectId: "demo",
    panes: ["one", "two"],
    activePane: "two",
  };
  const render = (zoomedPane: string) =>
    act(async () =>
      root.render(
        <TerminalTabPanes
          tab={tab}
          zoomedPane={zoomedPane}
          visible
          controls={controls}
          activeTarget={target}
          setTabs={() => {}}
          close={() => {}}
          paneProps={(_tab, pane) => ({ projectId: pane })}
        />,
      ),
    );
  try {
    await render("one");
    expect(
      host.querySelector('[data-testid="one"]')?.getAttribute("data-visible"),
    ).toBe("true");
    expect(
      host.querySelector('[data-testid="two"]')?.getAttribute("data-visible"),
    ).toBe("false");
    expect(
      host.querySelector('[data-testid="two"]')?.getAttribute("data-active"),
    ).toBe("false");
    await render("");
    expect(
      host.querySelector('[data-testid="two"]')?.getAttribute("data-visible"),
    ).toBe("true");
    expect(
      host.querySelector('[data-testid="two"]')?.getAttribute("data-active"),
    ).toBe("true");
  } finally {
    await act(async () => root.unmount());
  }
});
