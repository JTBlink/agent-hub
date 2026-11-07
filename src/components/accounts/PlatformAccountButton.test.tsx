// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { PlatformAccountButton } from "./PlatformAccountButton";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
let root: Root;
let host: HTMLDivElement;
const contexts = [
  { id: "default-github", provider: "github", host: "github.com" },
  { id: "default-gitlab", provider: "gitlab", host: "git.example.invalid" },
  { id: "custom-github", provider: "github", host: "github.com" },
];
const account = (username: string, host: string, active = true) => ({
  username,
  host,
  active,
  authenticated: true,
  switchable: true,
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "platform_account_contexts") return contexts;
    if (command === "platform_account_list") {
      const target =
        args &&
        "target" in args &&
        args.target &&
        typeof args.target === "object"
          ? args.target
          : {};
      return "provider" in target && target.provider === "gitlab"
        ? [account("gitlab-demo", "git.example.invalid")]
        : [
            account("github-demo", "github.com"),
            account("inactive", "github.com", false),
          ];
    }
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
});
it("shows active identities with platform icons, deduplicates contexts, and filters without querying again", async () => {
  const open = vi.fn();
  await act(async () =>
    root.render(
      <PlatformAccountButton provider="all" refreshKey={0} onClick={open} />,
    ),
  );
  expect(host.textContent).toContain("@github-demo");
  expect(host.textContent).toContain("@gitlab-demo");
  expect(host.textContent?.match(/@github-demo/g)).toHaveLength(1);
  expect(host.textContent).not.toContain("inactive");
  expect(host.querySelector("button")?.title).toContain(
    "GitLab · git.example.invalid · @gitlab-demo",
  );
  expect(
    host.querySelector('[role="img"][aria-label="GitHub"]'),
  ).not.toBeNull();
  const queries = vi.mocked(invoke).mock.calls.length;
  await act(async () =>
    root.render(
      <PlatformAccountButton provider="gitlab" refreshKey={0} onClick={open} />,
    ),
  );
  expect(host.textContent).toBe("@gitlab-demo");
  expect(vi.mocked(invoke).mock.calls).toHaveLength(queries);
  await act(async () => host.querySelector("button")!.click());
  expect(open).toHaveBeenCalledOnce();
});
it("rechecks identities after refresh and restores the sign-in entry when login is no longer valid", async () => {
  await act(async () =>
    root.render(
      <PlatformAccountButton
        provider="github"
        refreshKey={0}
        onClick={() => {}}
      />,
    ),
  );
  expect(host.textContent).toBe("@github-demo");
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "platform_account_contexts") return contexts;
    if (command === "platform_account_list")
      throw { kind: "authentication", message: "private-error" };
  });
  await act(async () =>
    root.render(
      <PlatformAccountButton
        provider="github"
        refreshKey={1}
        onClick={() => {}}
      />,
    ),
  );
  expect(host.textContent).toBe("tasks.accounts");
  expect(host.textContent).not.toContain("private-error");
});
it("bounds simultaneous reads and cancels pending queries without starting queued work after unmount", async () => {
  const complete: Array<(value: unknown) => void> = [];
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "platform_account_contexts") return contexts;
    if (command === "platform_account_list")
      return new Promise((resolve) => complete.push(resolve));
  });
  await act(async () =>
    root.render(
      <PlatformAccountButton
        provider="all"
        refreshKey={0}
        onClick={() => {}}
      />,
    ),
  );
  expect(complete).toHaveLength(2);
  await act(async () => root.render(null));
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "platform_account_cancel"),
  ).toHaveLength(2);
  await act(async () =>
    complete.forEach((resolve) => resolve([account("stale", "github.com")])),
  );
  expect(complete).toHaveLength(2);
  expect(host.textContent).not.toContain("stale");
});
