// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import * as api from "../../lib/tauri";
import { HerdrTerminalTools } from "./HerdrTerminalTools";
import type { PaneControl } from "./TerminalPane";
vi.mock("../../lib/tauri", () => ({
  getHerdrSnapshot: vi.fn(),
  runHerdrAction: vi.fn(),
  openHerdrWorkspace: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it.each([
  { split: false, switched: false },
  { split: true, switched: false },
  { split: false, switched: true },
])(
  "resolves the selected space without guessing a pane: %j",
  async ({ split, switched }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    const target: api.HerdrTarget = {
      session: "default",
      workspace_id: "space",
      pane_id: "pane",
      terminal_id: "terminal",
      revision: 1,
      agent_session: null,
    };
    const pane: api.HerdrPane = {
      ...target,
      tab_id: "tab",
      cwd: null,
      focused: false,
      agent_status: "unknown",
      agent: null,
      name: null,
    };
    const switchedPane = {
      ...pane,
      workspace_id: "second-space",
      tab_id: "second-tab",
      pane_id: "second-pane",
      terminal_id: "second-terminal",
      focused: true,
      revision: 9,
    };
    const snapshot: api.HerdrSnapshot = {
      version: "1",
      workspaces: [
        {
          workspace_id: "space",
          active_tab_id: "tab",
          label: "Demo",
          directory: null,
          branch: null,
        },
      ],
      panes: [
        pane,
        ...(split
          ? [{ ...pane, pane_id: "second", terminal_id: "second-terminal" }]
          : []),
      ],
      tabs: [],
      agents: [],
    };
    if (switched) {
      snapshot.workspaces.push({
        ...snapshot.workspaces[0],
        workspace_id: "second-space",
        active_tab_id: "second-tab",
      });
      snapshot.panes.push(switchedPane);
    }
    vi.mocked(api.getHerdrSnapshot).mockResolvedValue(snapshot);
    vi.mocked(api.runHerdrAction).mockResolvedValue({
      output: "selected output",
      target: null,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onError = vi.fn();
    const control: PaneControl = {
      sessionId: "client",
      cwd: "<workspace>",
      inputRevision: () => 0,
      ownsFocus: () => true,
      focus: vi.fn(),
      read: () => "",
    };
    try {
      await act(async () =>
        root.render(
          <HerdrTerminalTools
            target={target}
            current={() => control}
            onOpen={vi.fn()}
            onError={onError}
          />,
        ),
      );
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>('[aria-label="herdr.copyOutput"]')!
          .click(),
      );
      if (split) {
        expect(onError).toHaveBeenLastCalledWith(
          "terminal.herdrFocusUnavailable",
        );
        expect(api.runHerdrAction).not.toHaveBeenCalled();
        expect(writeText).not.toHaveBeenCalled();
      } else {
        expect(api.runHerdrAction).toHaveBeenCalledExactlyOnceWith(
          switched
            ? {
                ...target,
                workspace_id: switchedPane.workspace_id,
                pane_id: switchedPane.pane_id,
                terminal_id: switchedPane.terminal_id,
                revision: 9,
              }
            : target,
          "read",
        );
        expect(writeText).toHaveBeenCalledWith("selected output");
        expect(onError).not.toHaveBeenCalledWith(
          "terminal.herdrFocusUnavailable",
        );
        if (switched) {
          vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
            ...snapshot,
            panes: [
              { ...pane, focused: true },
              { ...switchedPane, focused: false },
            ],
          });
          await act(async () =>
            host
              .querySelector<HTMLButtonElement>(
                '[aria-label="herdr.copyOutput"]',
              )!
              .click(),
          );
          expect(api.runHerdrAction).toHaveBeenLastCalledWith(target, "read");
        }
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  },
);
