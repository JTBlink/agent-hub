// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { HerdrAgentDialog } from "./HerdrAgentDialog";
import { HerdrTerminalTools } from "../terminal/HerdrTerminalTools";
import * as api from "../api";
import { makeTool } from "../../../../tests/fixtures/workspace";

vi.mock("../../../context/AppContext", () => ({
  useApp: () => ({ tools: [makeTool("codex")] }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("../api", () => ({
  startHerdrAgent: vi.fn(),
  runHerdrAction: vi.fn(),
  getHerdrSnapshot: vi.fn(),
  getHerdrSidebarKeys: vi.fn(),
  writeTerminal: vi.fn(),
}));
const target = {
  session: "isolated",
  workspace_id: "w1",
  pane_id: "w1:p1",
  terminal_id: "native-1",
  revision: 3,
  agent_session: null,
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(writeText).mockResolvedValue(undefined);
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "0.9.3",
    workspaces: [
      {
        workspace_id: "w1",
        active_tab_id: "t1",
        label: "Demo",
        directory: null,
        branch: null,
      },
    ],
    tabs: [],
    panes: [
      {
        ...target,
        tab_id: "t1",
        focused: true,
        cwd: null,
        agent_status: "idle",
        agent: null,
        name: null,
      },
    ],
    agents: [],
  });
  vi.mocked(api.runHerdrAction).mockResolvedValue({
    output: "visible output",
    target: null,
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function button(label: string) {
  const b = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
  expect(b).toBeTruthy();
  return b!;
}
async function input(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("keeps the created pane available for inspection when startup is uncertain, without starting twice", async () => {
  const created = { ...target, pane_id: "w1:p2", terminal_id: "native-2" };
  vi.mocked(api.startHerdrAgent).mockResolvedValue({
    target: created,
    warning: "Agent is waiting for startup confirmation",
  });
  const focus = vi.fn().mockResolvedValue(undefined),
    close = vi.fn();
  await act(async () =>
    root.render(
      <HerdrAgentDialog
        request={{ mode: "new", target, label: "Demo" }}
        onClose={close}
        onComplete={() => {}}
        onFocus={focus}
      />,
    ),
  );
  await input(host.querySelector("input:not([type])")!, "reviewer");
  await input(host.querySelector("textarea")!, "Review the current diff");
  await act(async () => button("herdr.createAgent").click());
  expect(api.startHerdrAgent).toHaveBeenCalledWith(target, {
    kind: "codex",
    name: "reviewer",
    direction: "right",
    prompt: "Review the current diff",
  });
  expect(close).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "confirmation",
  );
  await act(async () => button("herdr.focus").click());
  expect(focus).toHaveBeenCalledWith(created);
  expect(api.startHerdrAgent).toHaveBeenCalledTimes(1);
});
it("submits an edited task once and only interrupts after confirmation", async () => {
  const focus = vi.fn();
  await act(async () =>
    root.render(
      <HerdrAgentDialog
        request={{ mode: "prompt", target, label: "Reviewer" }}
        onClose={() => {}}
        onComplete={() => {}}
        onFocus={focus}
      />,
    ),
  );
  await act(async () => button("herdr.templates.review.label").click());
  await input(
    host.querySelector("textarea")!,
    "Review only the current feature",
  );
  await act(async () => button("herdr.sendTask").click());
  expect(api.runHerdrAction).toHaveBeenCalledWith(
    target,
    "prompt",
    "Review only the current feature",
  );
  await act(async () =>
    root.render(
      <HerdrAgentDialog
        key="interrupt"
        request={{ mode: "interrupt", target, label: "Reviewer" }}
        onClose={() => {}}
        onComplete={() => {}}
        onFocus={focus}
      />,
    ),
  );
  expect(api.runHerdrAction).toHaveBeenCalledTimes(1);
  await act(async () => button("herdr.interrupt").click());
  expect(api.runHerdrAction).toHaveBeenLastCalledWith(target, "interrupt");
});
it("offers bottom actions without clear and copies visible output", async () => {
  const control = {
    sessionId: "client-1",
    cwd: "/projects/demo",
    inputRevision: () => 0,
    ownsFocus: () => true,
    projectId: "demo",
    focus: vi.fn(),
    clear: vi.fn(),
  };
  await act(async () =>
    root.render(
      <HerdrTerminalTools
        target={target}
        current={() => control}
        onOpen={() => {}}
        onError={() => {}}
      />,
    ),
  );
  expect(
    [...host.querySelectorAll("button")].map((b) =>
      b.getAttribute("aria-label"),
    ),
  ).toEqual([
    "herdr.newTab",
    "terminal.splitHorizontal",
    "terminal.splitVertical",
    "herdr.copyOutput",
    "herdr.toggleZoom",
    "terminal.closePane",
    "terminal.herdrSidebar",
  ]);
  await act(async () => button("herdr.copyOutput").click());
  expect(api.runHerdrAction).toHaveBeenCalledWith(target, "read");
  expect(writeText).toHaveBeenCalledWith("visible output");
  expect(host.querySelector('[aria-label="herdr.clear"]')).toBeNull();
  expect(control.clear).not.toHaveBeenCalled();
  expect(api.writeTerminal).not.toHaveBeenCalled();
  vi.mocked(api.getHerdrSidebarKeys).mockResolvedValue("\u0001b");
  await act(async () => button("terminal.herdrSidebar").click());
  expect(api.writeTerminal).toHaveBeenCalledWith("client-1", "\u0001b");
});

it("keeps the current terminal selected while viewing and copying another Agent output", async () => {
  const focus = vi.fn();
  await act(async () =>
    root.render(
      <HerdrAgentDialog
        request={{
          mode: "output",
          target,
          label: "Reviewer",
          output: "Other Agent output",
        }}
        onClose={() => {}}
        onComplete={() => {}}
        onFocus={focus}
      />,
    ),
  );
  expect(host.querySelector("pre")?.textContent).toBe("Other Agent output");
  await act(async () => button("herdr.copyOutput").click());
  expect(writeText).toHaveBeenCalledWith("Other Agent output");
  expect(focus).not.toHaveBeenCalled();
  expect(api.runHerdrAction).not.toHaveBeenCalled();
});

it("splits the currently focused pane instead of the stale attachment pane", async () => {
  const focused = {
    pane_id: "w1:p2",
    workspace_id: "w1",
    tab_id: "t2",
    terminal_id: "native-2",
    focused: true,
    revision: 9,
    agent_session: null,
    cwd: "/projects/demo",
    agent: null,
    agent_status: "idle",
    name: null,
  };
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "0.9.3",
    workspaces: [
      {
        workspace_id: "w1",
        active_tab_id: "t2",
        label: "Demo",
        directory: "/projects/demo",
        branch: null,
      },
    ],
    tabs: [],
    panes: [focused],
    agents: [],
  });
  const control = {
    sessionId: "client-1",
    cwd: "/projects/demo",
    inputRevision: () => 0,
    ownsFocus: () => true,
    focus: vi.fn(),
  };
  await act(async () =>
    root.render(
      <HerdrTerminalTools
        target={target}
        current={() => control}
        onOpen={() => {}}
        onError={() => {}}
      />,
    ),
  );
  await act(async () => button("terminal.splitHorizontal").click());
  expect(api.runHerdrAction).toHaveBeenCalledWith(
    {
      ...target,
      pane_id: "w1:p2",
      terminal_id: "native-2",
      revision: 9,
    },
    "split_right",
  );
});

it("closes the focused Herdr pane only after confirmation", async () => {
  const control = {
    sessionId: "client-1",
    cwd: "/projects/demo",
    inputRevision: () => 0,
    ownsFocus: () => true,
    focus: vi.fn(),
  };
  await act(async () =>
    root.render(
      <HerdrTerminalTools
        target={target}
        current={() => control}
        onOpen={() => {}}
        onError={() => {}}
      />,
    ),
  );
  await act(async () => button("terminal.closePane").click());
  expect(api.runHerdrAction).not.toHaveBeenCalled();
  const confirm =
    document.querySelector('[role="alertdialog"] button.app-button-danger') ??
    [...document.querySelectorAll('[role="alertdialog"] button')].find(
      (b) => b.textContent === "terminal.closePane",
    );
  expect(confirm).toBeTruthy();
  await act(async () => (confirm as HTMLButtonElement).click());
  expect(api.runHerdrAction).toHaveBeenCalledWith(target, "close");
});

it("refuses actions when the workspace has no identifiable focused pane", async () => {
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "0.9.3",
    workspaces: [],
    tabs: [],
    panes: [],
    agents: [],
  });
  const error = vi.fn();
  const control = {
    sessionId: "client-1",
    cwd: "/projects/demo",
    inputRevision: () => 0,
    ownsFocus: () => true,
    focus: vi.fn(),
  };
  await act(async () =>
    root.render(
      <HerdrTerminalTools
        target={target}
        current={() => control}
        onOpen={() => {}}
        onError={error}
      />,
    ),
  );
  await act(async () => button("terminal.splitHorizontal").click());
  expect(api.runHerdrAction).not.toHaveBeenCalled();
  expect(error).toHaveBeenLastCalledWith("terminal.herdrFocusUnavailable");
});
