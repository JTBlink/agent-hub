// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostsSettings } from "./HostsSettings";
import * as api from "../../lib/hostsApi";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import zh from "../../i18n/zh.json";

vi.mock("../../lib/hostsApi", () => ({
  readSystemHosts: vi.fn(),
  openHostsPermissionSettings: vi.fn(),
  saveSystemHosts: vi.fn(),
  listHostsProfiles: vi.fn(),
  createHostsProfile: vi.fn(),
  updateHostsProfile: vi.fn(),
  deleteHostsProfile: vi.fn(),
  applyHostsProfile: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
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
  vi.mocked(api.listHostsProfiles).mockResolvedValue([]);
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
    expect(host.querySelector("#hosts-path-label")?.textContent).toBe(
      "配置文件路径",
    );
    expect(location.textContent).toBe(path);
  },
);

it.each(["/etc/hosts", "C:\\Windows\\System32\\drivers\\etc\\hosts"])(
  "reveals the selected Hosts file in its containing folder: %s",
  async (path) => {
    vi.mocked(api.readSystemHosts).mockResolvedValueOnce({ ...initial, path });
    vi.mocked(revealItemInDir).mockResolvedValueOnce(undefined);
    await render();
    await act(async () => button("打开所在文件夹").click());
    expect(revealItemInDir).toHaveBeenCalledWith(path);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "系统文件管理器",
    );
  },
);

it("saves with the loaded revision and reports success", async () => {
  await render();
  await edit("::1 localhost\n");
  vi.mocked(api.saveSystemHosts).mockResolvedValue({
    snapshot: { ...initial, content: "::1 localhost\n", revision: "second" },
    backup_path: "/etc/hosts.backup",
  });
  await act(async () => button("保存").click());
  expect(api.saveSystemHosts).toHaveBeenCalledWith("::1 localhost\n", "first");
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "Hosts 已保存",
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
  ].find((item) => item.textContent === "确认")!;
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

const profile: api.HostsProfile = {
  id: "profile-1",
  name: "Development",
  content: "127.0.0.2 app.test\n",
  revision: "profile-first",
  path: "/workspace/user-config/hosts/profiles/profile-1/hosts",
};
async function selectProfile() {
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-pressed="false"]')!.click(),
  );
}
it("saves a profile without writing system hosts, then explicitly applies the saved revision", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  await edit("::1 app.test\n");
  const updated = {
    ...profile,
    content: "::1 app.test\n",
    revision: "profile-second",
  };
  vi.mocked(api.updateHostsProfile).mockResolvedValue(updated);
  await act(async () => button("保存方案").click());
  expect(api.updateHostsProfile).toHaveBeenCalledWith(
    profile,
    profile.name,
    "::1 app.test\n",
  );
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
  expect(api.applyHostsProfile).not.toHaveBeenCalled();
  vi.mocked(api.applyHostsProfile).mockResolvedValue({
    snapshot: { ...initial, content: updated.content, revision: "applied" },
    backup_path: null,
  });
  await act(async () => button("应用到系统").click());
  expect(api.applyHostsProfile).toHaveBeenCalledWith(updated, "first");
  expect(button("已应用").disabled).toBe(true);
});
it("preserves a profile draft on external reload and refuses stale writes", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  await edit("# unsaved\n");
  vi.mocked(api.listHostsProfiles).mockResolvedValue([
    { ...profile, content: "# external\n", revision: "external" },
  ]);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(editor().value).toBe("# unsaved\n");
  expect(host.textContent).toContain("磁盘内容已变化");
  vi.mocked(api.updateHostsProfile).mockRejectedValue(
    new Error("HOSTS_PROFILE_CONFLICT"),
  );
  await act(async () => button("保存方案").click());
  expect(editor().value).toBe("# unsaved\n");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "方案已在外部修改",
  );
});
it("requires confirmation before switching away from a system draft", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await edit("# draft\n");
  await selectProfile();
  expect(editor().value).toBe("# draft\n");
  await act(async () => button("取消").click());
  expect(editor().value).toBe("# draft\n");
  await selectProfile();
  await act(async () => button("确认").click());
  expect(editor().value).toBe(profile.content);
});
it("keeps the naming dialog open and preserves input when profile creation fails", async () => {
  await render();
  await act(async () => button("另存为方案").click());
  const input = document.querySelector<HTMLInputElement>(
    '[role="alertdialog"] input',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Saved system");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  vi.mocked(api.createHostsProfile).mockRejectedValue(new Error("disk full"));
  const save = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((item) => item.textContent === "保存")!;
  await act(async () => save.click());
  expect(api.createHostsProfile).toHaveBeenCalledWith(
    "Saved system",
    hostsContent(),
  );
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(input.value).toBe("Saved system");
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
});
function hostsContent() {
  return initial.content.replace(/\r\n/g, "\n");
}
it("renames a profile while preserving its unsaved content draft", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  await edit("# draft\n");
  await act(async () => button("重命名").click());
  const input = document.querySelector<HTMLInputElement>(
    '[role="alertdialog"] input',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Renamed");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  vi.mocked(api.updateHostsProfile).mockResolvedValue({
    ...profile,
    name: "Renamed",
    revision: "renamed",
  });
  await act(async () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[role="alertdialog"] button',
      ),
    ]
      .find((item) => item.textContent === "保存")!
      .click(),
  );
  expect(api.updateHostsProfile).toHaveBeenCalledWith(
    profile,
    "Renamed",
    profile.content,
  );
  expect(editor().value).toBe("# draft\n");
});
it("deletes only the selected profile and keeps the system content", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  vi.mocked(api.deleteHostsProfile).mockResolvedValue(undefined);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="删除方案"]')!.click(),
  );
  await act(async () => button("确认").click());
  expect(api.deleteHostsProfile).toHaveBeenCalledWith(profile);
  expect(editor().value).toBe(hostsContent());
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
});

it.each([false, true])(
  "retries the failed quick-apply target instead of the selected editor: %s",
  async (selectOther) => {
    const target = {
      ...profile,
      id: "profile-2",
      name: "Testing",
      revision: "target",
    };
    vi.mocked(api.listHostsProfiles).mockResolvedValue([profile, target]);
    await render();
    if (selectOther) await selectProfile();
    vi.mocked(api.applyHostsProfile).mockRejectedValueOnce(
      new Error("Authorization cancelled"),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="应用方案「Testing」"]')!
        .click(),
    );
    expect(api.applyHostsProfile).toHaveBeenLastCalledWith(target, "first");
    vi.mocked(api.applyHostsProfile).mockResolvedValueOnce({
      snapshot: { ...initial, content: target.content, revision: "applied" },
      backup_path: null,
    });
    await act(async () => button("重新授权并保存").click());
    expect(api.applyHostsProfile).toHaveBeenCalledTimes(2);
    expect(api.applyHostsProfile).toHaveBeenLastCalledWith(target, "first");
    expect(api.saveSystemHosts).not.toHaveBeenCalled();
    expect(api.updateHostsProfile).not.toHaveBeenCalled();
  },
);
