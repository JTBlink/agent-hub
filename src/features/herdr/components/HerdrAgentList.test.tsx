// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HerdrAgentList } from "./HerdrAgentList";
import type { HerdrPane } from "../api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("allows follow-up prompts while working and keeps blocked or unknown Agents protected", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const request = vi.fn();
  const agent: HerdrPane = {
    pane_id: "w1:p1",
    workspace_id: "w1",
    tab_id: "w1:t1",
    terminal_id: "terminal-1",
    cwd: null,
    focused: true,
    revision: 1,
    agent_status: "working",
    agent: "codex",
    name: "Demo",
    agent_session: null,
  };
  try {
    for (const status of ["working", "blocked", "unknown"]) {
      const pane = { ...agent, agent_status: status };
      await act(async () =>
        root.render(
          <HerdrAgentList
            agents={[pane]}
            workspaces={[]}
            agentsOpen
            grouped={false}
            busy={false}
            onToggle={() => {}}
            onToggleGrouping={() => {}}
            open={() => {}}
            request={request}
          />,
        ),
      );
      const send = host.querySelector<HTMLButtonElement>(
        '[aria-label="herdr.dialog.prompt Demo"]',
      )!;
      expect(send.disabled).toBe(status !== "working");
      await act(async () => send.click());
    }
    expect(request).toHaveBeenCalledExactlyOnceWith("prompt", agent);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
