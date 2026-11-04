import { describe, expect, it } from "vitest";
import { shortcutSelected, toggleLaunchShortcut } from "./agentLaunchConfig";

describe("Agent launch instruction editing", () => {
  it("toggles a flag without changing quoted values or unrelated arguments", () => {
    const command = `codex --config 'note=--search' --literal "$(touch NEVER)"`;
    expect(shortcutSelected(command, "--search")).toBe(false);
    const added = toggleLaunchShortcut(command, "--search");
    expect(added).toBe(`${command} --search`);
    expect(toggleLaunchShortcut(added, "--search")).toBe(command);
  });
  it("keeps positional text after the argument separator and unfinished drafts", () => {
    expect(toggleLaunchShortcut("codex -- --search", "--search")).toBe(
      "codex --search -- --search",
    );
    expect(shortcutSelected("codex -- --search", "--search")).toBe(false);
    expect(toggleLaunchShortcut(`codex --config 'unfinished`, "--search")).toBe(
      `codex --config 'unfinished`,
    );
  });
});
