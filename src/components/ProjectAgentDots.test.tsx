// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProjectAgentTarget } from "../lib/tauri";
import { ProjectAgentDots } from "./ProjectAgentDots";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function target(
  key: string,
  installed = true,
  enabled = true,
): ProjectAgentTarget {
  return { key, display_name: key, installed, enabled, is_custom: false };
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("hides uninstalled and unknown agents even when assigned to the project", async () => {
  await act(async () =>
    root.render(
      <ProjectAgentDots
        targets={[target("claude_code"), target("cursor", false)]}
        assignedAgents={["claude_code", "cursor", "unknown_agent"]}
      />,
    ),
  );
  const titles = [...container.querySelectorAll("[title]")].map((node) =>
    node.getAttribute("title"),
  );
  expect(titles).toEqual(["claude_code · assigned"]);
});

it("keeps installed disabled agents and preserves add and remove actions", async () => {
  const onToggle = vi.fn();
  await act(async () =>
    root.render(
      <ProjectAgentDots
        targets={[
          target("claude_code", true, false),
          target("codex"),
          target("cursor", false),
        ]}
        assignedAgents={["claude_code"]}
        onToggle={onToggle}
      />,
    ),
  );
  const buttons = container.querySelectorAll("button");
  expect(buttons).toHaveLength(2);
  await act(async () => {
    buttons[0].click();
    buttons[1].click();
  });
  expect(onToggle.mock.calls).toEqual([
    ["claude_code", false],
    ["codex", true],
  ]);
});

it("counts only installed agents in overflow and expanded shortcuts", async () => {
  await act(async () =>
    root.render(
      <ProjectAgentDots
        targets={[
          target("cursor", false),
          target("claude_code"),
          target("codex"),
          target("gemini_cli"),
          target("opencode", false),
        ]}
        assignedAgents={["cursor", "opencode", "unknown_agent"]}
        limit={1}
        onToggle={vi.fn()}
      />,
    ),
  );
  const expand = container.querySelector<HTMLButtonElement>(
    '[aria-expanded="false"]',
  );
  expect(expand?.textContent).toBe("+2");
  await act(async () => expand?.click());
  const titles = [...container.querySelectorAll("button[title]")].map(
    (node) => node.getAttribute("title")?.split(" · ")[0],
  );
  expect(titles).toEqual([
    "claude_code",
    "codex",
    "gemini_cli",
    "common.collapse",
  ]);
});

it("shows no shortcuts before detection and removes agents after uninstall", async () => {
  async function render(targets: ProjectAgentTarget[]) {
    await act(async () =>
      root.render(
        <ProjectAgentDots
          targets={targets}
          assignedAgents={["claude_code"]}
          onToggle={vi.fn()}
        />,
      ),
    );
  }
  await render([]);
  expect(container.querySelectorAll("button")).toHaveLength(0);
  await render([target("claude_code")]);
  expect(container.querySelectorAll("button")).toHaveLength(1);
  await render([target("claude_code", false)]);
  expect(container.querySelectorAll("button")).toHaveLength(0);
});
