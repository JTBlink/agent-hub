// @vitest-environment jsdom
import type { Terminal } from "@xterm/xterm";
import { expect, it, vi } from "vitest";
import { bindTerminalWebLinks } from "./terminalWebLinks";
import { openWebLink } from "../../lib/openWebLink";
vi.mock("../../lib/openWebLink", () => ({
  openWebLink: vi.fn().mockResolvedValue(undefined),
  invertLinkDestination: (event: MouseEvent) => event.shiftKey,
}));
it("opens only matched suppressed left gestures and unregisters the real URL provider", async () => {
  const providerDispose = vi.fn();
  const previous = { activate: vi.fn() };
  const element = document.createElement("div");
  const terminal = {
    element,
    options: { linkHandler: previous },
    loadAddon: (addon: { activate: (terminal: unknown) => void }) =>
      addon.activate(terminal),
    registerLinkProvider: () => ({ dispose: providerDispose }),
  };
  const report = vi.fn();
  const stop = bindTerminalWebLinks(terminal as unknown as Terminal, report);
  const handler = terminal.options.linkHandler as NonNullable<
    Terminal["options"]["linkHandler"]
  >;
  const address = "https://example.invalid";
  handler.hover?.(new MouseEvent("mousemove"), address, {
    start: { x: 1, y: 1 },
    end: { x: 2, y: 1 },
  });
  const input = vi.fn();
  element.addEventListener("mousedown", input);
  const down = (options: MouseEventInit = {}) =>
    element.dispatchEvent(new MouseEvent("mousedown", options));
  const up = (options: MouseEventInit = {}) =>
    element.dispatchEvent(new MouseEvent("mouseup", options));
  down();
  up();
  expect(input).toHaveBeenCalledOnce();
  expect(openWebLink).not.toHaveBeenCalled();
  for (const button of [1, 2]) {
    down({ ctrlKey: true, button });
    up({ ctrlKey: true, button });
    handler.activate(
      new MouseEvent("mouseup", { ctrlKey: true, button }),
      address,
      { start: { x: 1, y: 1 }, end: { x: 2, y: 1 } },
    );
  }
  down();
  up({ ctrlKey: true });
  handler.activate(new MouseEvent("mouseup", { ctrlKey: true }), address, {
    start: { x: 1, y: 1 },
    end: { x: 2, y: 1 },
  });
  expect(openWebLink).not.toHaveBeenCalled();
  input.mockClear();
  down({ ctrlKey: true });
  up({ ctrlKey: true, shiftKey: true });
  expect(openWebLink).toHaveBeenCalledExactlyOnceWith(address, {
    invert: true,
  });
  expect(input).not.toHaveBeenCalled();
  vi.mocked(openWebLink).mockRejectedValueOnce(Error("failed"));
  down({ metaKey: true });
  up({ metaKey: true });
  await Promise.resolve();
  expect(report).toHaveBeenCalledOnce();
  stop();
  expect(providerDispose).toHaveBeenCalledOnce();
  expect(terminal.options.linkHandler).toBe(previous);
  vi.mocked(openWebLink).mockClear();
  down({ ctrlKey: true });
  up({ ctrlKey: true });
  expect(openWebLink).not.toHaveBeenCalled();
});
