// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { githubPlatform } from "../../features/github/platform";
import { AuthLoginProgress } from "./AuthLoginProgress";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));
vi.mock("../terminal/TerminalPane", () => ({
  TerminalPane: ({
    onScreen,
    onReady,
  }: {
    onScreen: (text: string) => void;
    onReady: (control: unknown) => void;
  }) => (
    <button
      onClick={() => {
        onReady({
          sessionId: "auth-session",
          cwd: "",
          focus: () => {},
          inputRevision: () => 0,
          ownsFocus: () => false,
        });
        onScreen(
          "First copy your one-time code: DEMO-1234\nPress Enter to open https://github.com/login/device in your browser...",
        );
      }}
    >
      Device prompt
    </button>
  ),
}));
it("keeps the device code available with copy, browser continuation and verification feedback", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  const root = createRoot(host);
  const props = {
    platform: githubPlatform,
    host: "github.com",
    createSession: vi.fn(),
    onReady: vi.fn(),
    onExit: vi.fn(),
  };
  try {
    await act(async () =>
      root.render(<AuthLoginProgress {...props} verifying={false} />),
    );
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).toContain("DEMO-1234");
    const button = (key: string) =>
      [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === key,
      )!;
    await act(async () => button("accounts.copyCode").click());
    expect(writeText).toHaveBeenCalledWith("DEMO-1234");
    await act(async () => button("accounts.openAuthorization").click());
    expect(invoke).toHaveBeenCalledWith("terminal_write", {
      id: "auth-session",
      data: "\r",
    });
    await act(async () => button("accounts.openAuthorization").click());
    expect(openUrl).toHaveBeenCalledWith("https://github.com/login/device");
    await act(async () =>
      root.render(<AuthLoginProgress {...props} verifying />),
    );
    expect(host.textContent).toContain("accounts.verifying");
    expect(host.textContent).toContain("DEMO-1234");
    expect(button("accounts.openAuthorization").disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
  }
});
