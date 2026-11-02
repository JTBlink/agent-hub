// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { GitReferenceSummary } from "./GitReferenceSummary";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const translate = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));

it.each(["tags", "branches", "remotes", "stashes"] as const)(
  "copies the complete %s name and SHA through context actions without expanding history",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    vi.mocked(writeText).mockResolvedValue(undefined);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const name = "archive/ci-mirror-playwright-1.64.1";
    const sha = "abcdef".repeat(6) + "abcd";
    try {
      await act(async () =>
        root.render(
          <details>
            <GitReferenceSummary
              entry={{ kind, name, sha, summary: "Archived mirror" }}
            />
          </details>,
        ),
      );
      const summary = host.querySelector("summary")!;
      expect(summary.textContent).toContain(name);
      await act(async () =>
        summary.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: window.innerWidth - 2,
            clientY: window.innerHeight - 2,
          }),
        ),
      );
      const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
      expect(menu).not.toBeNull();
      expect(Number.parseFloat(menu.style.top)).toBeLessThan(
        window.innerHeight - 8,
      );
      const copyName =
        menu.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
      expect(copyName.textContent).toBe(
        kind === "tags" ? "git.copyTagName" : "git.copyReferenceName",
      );
      await act(async () => copyName.click());
      expect(writeText).toHaveBeenLastCalledWith(name);
      expect(toast.success).toHaveBeenCalledWith("git.referenceCopied");
      expect(host.querySelector("details")!.open).toBe(false);
      expect(document.activeElement).toBe(summary);
      await act(async () =>
        summary.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "F10",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      const copySha = document.querySelector<HTMLButtonElement>(
        '[role="menuitem"][title="git.copyCommitSha"]',
      )!;
      vi.mocked(writeText).mockRejectedValueOnce(
        new Error("Clipboard unavailable"),
      );
      await act(async () => copySha.click());
      expect(toast.error).toHaveBeenCalledWith("Clipboard unavailable");
      await act(async () =>
        summary.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
        ),
      );
      await act(async () =>
        document
          .querySelector<HTMLButtonElement>('[title="git.copyCommitSha"]')!
          .click(),
      );
      expect(writeText).toHaveBeenLastCalledWith(sha);
      expect(host.querySelector("details")!.open).toBe(false);
      await act(async () =>
        summary.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
        ),
      );
      await act(async () =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      );
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(summary);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  },
);
