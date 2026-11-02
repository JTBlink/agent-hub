// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GitGraphToolbar } from "./GitGraphToolbar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("focuses search, opens the terminal, changes display settings and blocks busy repository actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onTerminal = vi.fn();
  const onFetch = vi.fn();
  const onRefresh = vi.fn();
  const onLimit = vi.fn();
  function Toolbar({ busy = false }: { busy?: boolean }) {
    const [query, onQuery] = useState("example");
    return (
      <GitGraphToolbar
        remotes
        onRemotes={vi.fn()}
        query={query}
        onQuery={onQuery}
        limit={200}
        onLimit={onLimit}
        loading={false}
        busy={busy}
        fetching={busy}
        onTerminal={onTerminal}
        onFetch={onFetch}
        onRefresh={onRefresh}
      />
    );
  }
  const button = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  try {
    await act(async () => root.render(<Toolbar />));
    await act(async () => button("git.graph.search").click());
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(document.activeElement).toBe(input);
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(input.value).toBe("");
    await act(async () => button("git.graph.terminal").click());
    expect(onTerminal).toHaveBeenCalledOnce();
    await act(async () => button("git.graph.settings").click());
    const select = host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    await act(async () => select.click());
    const option = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((item) => item.textContent?.includes("1000"))!;
    await act(async () => option.click());
    expect(onLimit).toHaveBeenCalledWith(1000);
    await act(async () =>
      select.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(host.querySelector('[role="region"]')).toBeNull();
    expect(document.activeElement).toBe(button("git.graph.settings"));
    await act(async () => {
      button("git.actions.fetch").click();
      button("settings.refresh").click();
    });
    expect(onFetch).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
    await act(async () => root.render(<Toolbar busy />));
    expect(button("git.actions.fetch").disabled).toBe(true);
    expect(button("settings.refresh").disabled).toBe(true);
    await act(async () => {
      button("git.actions.fetch").click();
      button("settings.refresh").click();
    });
    expect(onFetch).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
