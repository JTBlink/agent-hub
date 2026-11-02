// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TerminalTabs } from "./TerminalTabs";
import { createTerminalTab } from "../../lib/terminalLayout";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("renames from the context menu, cancels edits and restores the automatic Herdr name when cleared", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const initial = { ...createTerminalTab("demo"), herdrSession: "work" };
  const selected = vi.fn();
  function Harness() {
    const [tab, setTab] = useState(initial);
    return (
      <TerminalTabs
        tabs={[tab]}
        projects={[]}
        activeId={tab.id}
        scoped
        onClose={() => {}}
        onSelect={selected}
        onRename={(_, title) => setTab({ ...tab, title: title || undefined })}
      />
    );
  }
  const tabButton = () =>
    host.querySelector<HTMLButtonElement>('[role="tab"]')!;
  const edit = () => host.querySelector<HTMLInputElement>("input")!;
  const key = (element: HTMLElement, key: string) =>
    act(async () => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    });
  const change = (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(edit(), value);
      edit().dispatchEvent(new Event("input", { bubbles: true }));
    });
  try {
    await act(async () => root.render(<Harness />));
    expect(tabButton().textContent).toBe("herdr-work");
    await act(async () => {
      tabButton().dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: 300,
          clientY: 120,
        }),
      );
    });
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
    expect(selected).not.toHaveBeenCalled();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click(),
    );
    expect(document.activeElement).toBe(edit());
    await change("  Review  ");
    await key(edit(), "Enter");
    expect(tabButton().textContent).toBe("Review");
    expect(document.activeElement).toBe(tabButton());
    await key(tabButton(), "F2");
    await change("Discard");
    await key(edit(), "Escape");
    expect(tabButton().textContent).toBe("Review");
    await key(tabButton(), "F2");
    await change(" ");
    await key(edit(), "Enter");
    expect(tabButton().textContent).toBe("herdr-work");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
