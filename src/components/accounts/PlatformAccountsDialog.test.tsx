// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { PlatformAccountsDialog } from "./PlatformAccountsDialog";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../terminal/TerminalPane", () => ({
  TerminalPane: ({ onExit }: { onExit: (code: number) => void }) => (
    <button onClick={() => onExit(0)}>Finish CLI sign-in</button>
  ),
}));
let root: Root;
let host: HTMLDivElement;
const contexts = [
  {
    id: "default-github",
    provider: "github",
    host: "github.com",
    label: "",
    project_scoped: false,
    remembered: false,
  },
  {
    id: "default-gitlab",
    provider: "gitlab",
    host: "gitlab.com",
    label: "",
    project_scoped: false,
    remembered: false,
  },
  {
    id: "project-launcher",
    provider: "gitlab",
    host: "git.example.invalid",
    label: "Demo",
    project_scoped: true,
    remembered: false,
  },
];
const account = (username: string, active = true) => ({
  host: "github.com",
  username,
  active,
  authenticated: true,
  switchable: true,
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "platform_account_contexts"
      ? contexts
      : command === "platform_account_list"
        ? [account("demo"), account("second", false)]
        : undefined,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === label,
  )!;
const click = async (label: string) => act(async () => button(label).click());
it("keeps platform accounts separate, switches a saved GitHub identity and refreshes callers", async () => {
  const changed = vi.fn(async () => {});
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "platform_account_contexts") return contexts;
    if (command === "platform_account_list")
      return [account("demo"), account("second", false)];
    if (command === "platform_account_switch") return [account("second")];
  });
  await act(async () =>
    root.render(
      <PlatformAccountsDialog onChanged={changed} onClose={() => {}} />,
    ),
  );
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(host.textContent).toContain("@second");
  expect(host.querySelector('[aria-label="tasks.connections"]')).toBeNull();
  await click("accounts.switch");
  expect(
    vi
      .mocked(invoke)
      .mock.calls.find(
        ([command]) => command === "platform_account_switch",
      )?.[1],
  ).toMatchObject({
    target: { provider: "github", host: "github.com" },
    username: "second",
  });
  expect(changed).toHaveBeenCalled();
  await click("GitLab");
  expect(host.textContent).toContain("accounts.gitlabSwitchHint");
  await click("accounts.switch");
  expect(host.querySelector('form [role="combobox"]')?.textContent).toContain(
    "accounts.cliLogin",
  );
  expect(host.querySelector('input[type="password"]')).toBeNull();
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "platform_account_switch"),
  ).toHaveLength(1);
});
it("passes a token only to the login IPC, clears its input, and retains errors without echoing secrets", async () => {
  const changed = vi.fn(async () => {});
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "platform_account_contexts") return contexts;
    if (command === "platform_account_list") return [];
    if (command === "platform_account_token_login")
      throw { kind: "authentication", message: "private-secret-marker" };
  });
  await act(async () =>
    root.render(
      <PlatformAccountsDialog onChanged={changed} onClose={() => {}} />,
    ),
  );
  await click("accounts.add");
  await act(async () =>
    host.querySelector<HTMLButtonElement>('form [role="combobox"]')!.click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((option) => option.textContent === "accounts.token")!
      .click(),
  );
  const input = host.querySelector<HTMLInputElement>('input[type="password"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "private-secret-marker");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(input.value).toBe("");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "tasks.errors.authentication",
  );
  expect(host.textContent).not.toContain("private-secret-marker");
  expect(JSON.stringify(localStorage)).not.toContain("private-secret-marker");
  expect(
    vi
      .mocked(invoke)
      .mock.calls.find(
        ([command]) => command === "platform_account_token_login",
      )?.[1],
  ).toMatchObject({ token: "private-secret-marker" });
  expect(changed).not.toHaveBeenCalled();
});
it("cancels a previous platform query and ignores its late result", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "platform_account_contexts") return contexts;
    if (command === "platform_account_list") {
      const target = args && "target" in args ? args.target : null;
      return target &&
        typeof target === "object" &&
        "provider" in target &&
        target.provider === "github"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : [account("gitlab-demo")];
    }
  });
  await act(async () =>
    root.render(
      <PlatformAccountsDialog onChanged={async () => {}} onClose={() => {}} />,
    ),
  );
  await click("GitLab");
  await act(async () => finish([account("stale-account")]));
  expect(host.textContent).toContain("@gitlab-demo");
  expect(host.textContent).not.toContain("stale-account");
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "platform_account_cancel"),
  ).toBe(true);
});

it("labels sites with identities and keeps signed-out sites below authenticated project sources", async () => {
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
      return "host" in target && target.host === "gitlab.com"
        ? []
        : [account("demo")];
    }
  });
  await act(async () =>
    root.render(
      <PlatformAccountsDialog
        initialProvider="gitlab"
        onChanged={async () => {}}
        onClose={() => {}}
      />,
    ),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
  );
  const options = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].map((option) => option.textContent);
  expect(options).toEqual([
    "git.example.invalid · @demo · Demo",
    "gitlab.com · accounts.siteStatus.signed_out",
  ]);
  expect(options.join(" ")).not.toContain("glab");
});

it("keeps the modal open during Auth and identity verification, including Escape and backdrop attempts", async () => {
  const close = vi.fn();
  let hold = false;
  let verified!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "platform_account_contexts") return contexts;
    if (command === "platform_account_list")
      return hold
        ? new Promise((resolve) => {
            verified = resolve;
          })
        : [account("demo")];
  });
  await act(async () =>
    root.render(
      <PlatformAccountsDialog onChanged={async () => {}} onClose={close} />,
    ),
  );
  await click("accounts.add");
  expect(host.querySelector('form [role="combobox"]')?.textContent).toContain(
    "accounts.cliLogin",
  );
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const dialog = host.querySelector("dialog")!;
  const closeButton = host.querySelector<HTMLButtonElement>(
    '[aria-label="common.close"]',
  )!;
  expect(closeButton.disabled).toBe(true);
  await act(async () => {
    dialog.dispatchEvent(
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    dialog.click();
  });
  expect(close).not.toHaveBeenCalled();
  expect(dialog.open).toBe(true);
  hold = true;
  await click("Finish CLI sign-in");
  expect(host.textContent).toContain("accounts.verifying");
  expect(closeButton.disabled).toBe(true);
  expect(dialog.open).toBe(true);
  hold = false;
  await act(async () => verified([account("demo")]));
  expect(host.textContent).not.toContain("Finish CLI sign-in");
  expect(dialog.open).toBe(true);
  expect(closeButton.disabled).toBe(false);
  expect(close).not.toHaveBeenCalled();
});

it("retains the account popup across window activation and restores a dismissed native dialog", async () => {
  const close = vi.fn();
  await act(async () =>
    root.render(
      <PlatformAccountsDialog onChanged={async () => {}} onClose={close} />,
    ),
  );
  const dialog = host.querySelector("dialog")!;
  await act(async () => {
    window.dispatchEvent(new Event("blur"));
    dialog.click();
    window.dispatchEvent(new Event("focus"));
  });
  expect(close).not.toHaveBeenCalled();
  expect(dialog.open).toBe(true);
  await act(async () => {
    dialog.close();
    window.dispatchEvent(new Event("focus"));
  });
  expect(dialog.open).toBe(true);
  expect(close).not.toHaveBeenCalled();
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="common.close"]')!
      .click(),
  );
  expect(close).toHaveBeenCalledOnce();
});
