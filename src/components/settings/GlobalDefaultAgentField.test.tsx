// @vitest-environment jsdom
import { MemoryRouter } from "react-router-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GlobalDefaultAgentField } from "./GlobalDefaultAgentField";
import type { AgentLaunchDocument } from "../../lib/agentLaunchConfig";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("changes only the shared default, preserves unknown selections and disables writes while saving", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const documentValue: AgentLaunchDocument = {
    schema_version: 2,
    default_agent: "other-device-agent",
    schemes: {
      codex: {
        default_id: "custom",
        items: [
          { id: "custom", name: "Custom", instruction: "codex --search" },
        ],
      },
    },
  };
  let written: AgentLaunchDocument | undefined;
  const save = vi.fn(
    async (change: (current: AgentLaunchDocument) => AgentLaunchDocument) => {
      written = change(documentValue);
      return true;
    },
  );
  const render = (busy = false) =>
    root.render(
      <MemoryRouter>
        <GlobalDefaultAgentField
          tools={[
            { key: "codex", display_name: "Codex", installed: true },
            {
              key: "claude_code",
              display_name: "Claude Code",
              installed: true,
            },
          ]}
          controller={{
            snapshot: {
              document: documentValue,
              revision: "one",
              defaults: {},
            },
            busy,
            error: "",
            save,
            reload: async () => {},
          }}
        />
      </MemoryRouter>,
    );
  try {
    await act(async () => render());
    expect(host.textContent).toContain("other-device-agent");
    const select = host.querySelector("select")!;
    expect(select.value).toBe("other-device-agent");
    await act(async () => {
      select.value = "codex";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(written).toEqual({ ...documentValue, default_agent: "codex" });
    expect(documentValue.default_agent).toBe("other-device-agent");
    await act(async () => render(true));
    expect(
      host.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')
        ?.disabled,
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("selects the shared default scheme without copying or changing its command", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let documentValue: AgentLaunchDocument = {
    schema_version: 2,
    default_agent: "codex",
    schemes: {
      codex: {
        default_id: "first",
        items: [
          { id: "first", name: "First", instruction: "codex --search" },
          {
            id: "second",
            name: "Second",
            instruction: "custom-codex --profile demo",
          },
        ],
      },
    },
  };
  const items = documentValue.schemes?.codex.items;
  const render = () =>
    root.render(
      <MemoryRouter>
        <GlobalDefaultAgentField
          tools={[{ key: "codex", display_name: "Codex", installed: true }]}
          controller={{
            snapshot: {
              document: documentValue,
              revision: "one",
              defaults: {},
            },
            busy: false,
            error: "",
            reload: async () => {},
            save: async (change) => {
              documentValue = change(documentValue);
              render();
              return true;
            },
          }}
        />
      </MemoryRouter>,
    );
  try {
    await act(async () => render());
    const select = host.querySelector<HTMLSelectElement>(
      'select[aria-label="agentLaunch.globalDefaultScheme"]',
    )!;
    expect(select.value).toBe("first");
    await act(async () => {
      select.value = "second";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(documentValue.schemes?.codex.default_id).toBe("second");
    expect(documentValue.schemes?.codex.items).toEqual(items);
    expect(host.querySelector("code")?.textContent).toBe(
      "custom-codex --profile demo",
    );
    expect(documentValue.default_agent).toBe("codex");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
