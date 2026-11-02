// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostsSettings } from "./HostsSettings";
import * as api from "../../lib/hostsApi";
import zh from "../../i18n/zh.json";

vi.mock("../../lib/hostsApi", () => ({
  readSystemHosts: vi.fn(),
  openHostsPermissionSettings: vi.fn(),
  saveSystemHosts: vi.fn(),
}));
const initial = {
  path: "/etc/hosts",
  content: "127.0.0.1 localhost\r\n",
  revision: "first",
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vi.mocked(api.readSystemHosts).mockResolvedValue(initial);
  vi.mocked(api.openHostsPermissionSettings).mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(active = true) {
  const i18n = createInstance();
  await i18n.init({
    lng: "zh",
    interpolation: { escapeValue: false },
    resources: { zh: { translation: zh } },
  });
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <HostsSettings active={active} />
      </I18nextProvider>,
    ),
  );
}
const editor = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === label,
  )!;
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(editor(), value);
    editor().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("loads only when opened and treats CRLF as an unchanged draft", async () => {
  await render(false);
  expect(api.readSystemHosts).not.toHaveBeenCalled();
  await render();
  expect(editor().value).toBe("127.0.0.1 localhost\n");
  expect(button("保存").disabled).toBe(true);
});

it.each(["/etc/hosts", "C:\\Windows\\System32\\drivers\\etc\\hosts"])(
  "shows the actual configuration path returned by the system: %s",
  async (path) => {
    vi.mocked(api.readSystemHosts).mockResolvedValueOnce({ ...initial, path });
    await render();
    const location = host.querySelector(
      '[aria-labelledby="hosts-path-label"]',
    )!;
    expect(location.textContent).toContain("配置文件路径");
    expect(location.querySelector("code")?.textContent).toBe(path);
  },
);

it("saves with the loaded revision and displays the backup after success", async () => {
  await render();
  await edit("::1 localhost\n");
  vi.mocked(api.saveSystemHosts).mockResolvedValue({
    snapshot: { ...initial, content: "::1 localhost\n", revision: "second" },
    backup_path: "/etc/hosts.backup",
  });
  await act(async () => button("保存").click());
  expect(api.saveSystemHosts).toHaveBeenCalledWith("::1 localhost\n", "first");
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "/etc/hosts.backup",
  );
  expect(button("保存").disabled).toBe(true);
  await edit("127.0.0.2 demo.test\n");
  await act(async () => button("保存").click());
  expect(api.saveSystemHosts).toHaveBeenLastCalledWith(
    "127.0.0.2 demo.test\n",
    "second",
  );
});

it.each([
  ["HOSTS_CONFLICT", "其他程序修改"],
  ["HOSTS_INVALID_LINE:2", "第 2 行"],
  ["Authorization cancelled", "原稿已保留"],
])("preserves the draft when saving fails: %s", async (message, expected) => {
  await render();
  await edit("# draft\n::1 localhost\n");
  vi.mocked(api.saveSystemHosts).mockRejectedValue({ kind: "io", message });
  await act(async () => button("保存").click());
  expect(editor().value).toBe("# draft\n::1 localhost\n");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(expected);
  expect(button("保存").disabled).toBe(false);
});

it("requires confirmation to discard edits and retains them when reload fails", async () => {
  await render();
  await edit("::1 localhost\n");
  await act(async () => button("重新读取").click());
  expect(api.readSystemHosts).toHaveBeenCalledTimes(1);
  await act(async () => button("取消").click());
  expect(editor().value).toBe("::1 localhost\n");
  vi.mocked(api.readSystemHosts).mockRejectedValue(
    new Error("Permission denied"),
  );
  await act(async () => button("重新读取").click());
  const confirm = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((item) => item.textContent === "重新读取")!;
  await act(async () => confirm.click());
  expect(api.readSystemHosts).toHaveBeenCalledTimes(2);
  expect(editor().value).toBe("::1 localhost\n");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Permission denied",
  );
});

it("disables editing and duplicate saves during authorization", async () => {
  await render();
  await edit("::1 localhost\n");
  let finish!: (value: api.HostsSaved) => void;
  vi.mocked(api.saveSystemHosts).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => button("保存").click());
  expect(editor().disabled).toBe(true);
  expect(button("重新读取").disabled).toBe(true);
  expect(api.saveSystemHosts).toHaveBeenCalledTimes(1);
  await act(async () =>
    finish({
      snapshot: { ...initial, content: "::1 localhost\n" },
      backup_path: null,
    }),
  );
  expect(editor().disabled).toBe(false);
});

it("opens system permission settings directly without saving or changing the draft", async () => {
  await render();
  await edit("::1 localhost\n");
  await act(async () => button("打开系统权限设置").click());
  expect(api.openHostsPermissionSettings).toHaveBeenCalledTimes(1);
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
  expect(editor().value).toBe("::1 localhost\n");
});

it("shows an actionable error when the system settings page cannot be opened", async () => {
  await render();
  vi.mocked(api.openHostsPermissionSettings).mockRejectedValueOnce({
    kind: "io",
    message: "HOSTS_SETTINGS_UNAVAILABLE",
  });
  await act(async () => button("打开系统权限设置").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "当前桌面未提供",
  );
  await act(async () => button("打开系统权限设置").click());
  expect(api.openHostsPermissionSettings).toHaveBeenCalledTimes(2);
});

it.each([
  "User canceled. (-128)",
  "Access is denied. (os error 5)",
  "pkexec: No authentication agent found",
])(
  "opens system permission settings and retries the preserved draft: %s",
  async (message) => {
    await render();
    await edit("::1 localhost\n");
    vi.mocked(api.saveSystemHosts).mockRejectedValueOnce({
      kind: "io",
      message,
    });
    await act(async () => button("保存").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "打开系统权限设置",
    );
    await act(async () => button("打开系统权限设置").click());
    expect(api.openHostsPermissionSettings).toHaveBeenCalledTimes(1);
    vi.mocked(api.saveSystemHosts).mockResolvedValueOnce({
      snapshot: { ...initial, content: "::1 localhost\n", revision: "second" },
      backup_path: "/etc/hosts.backup",
    });
    await act(async () => button("重新授权并保存").click());
    expect(api.saveSystemHosts).toHaveBeenLastCalledWith(
      "::1 localhost\n",
      "first",
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Hosts 已保存",
    );
  },
);
