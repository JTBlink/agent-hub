// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostsSettings } from "./HostsSettings";
import * as api from "../../lib/hostsApi";
import { openContainingDirectoryInVscode } from "../../lib/openInVscode";
import { toast } from "sonner";
import zh from "../../i18n/zh.json";

vi.mock("../../lib/openInVscode", () => ({
  openContainingDirectoryInVscode: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
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
    (item) =>
      item.textContent === label || item.getAttribute("aria-label") === label,
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

it.each(["/etc/hosts", String.raw`C:\Windows\System32\drivers\etc\hosts`])(
  "opens the system Hosts folder in VS Code without replacing the selected draft: %s",
  async (path) => {
    vi.mocked(api.readSystemHosts).mockResolvedValueOnce({ ...initial, path });
    vi.mocked(api.listHostsProfiles).mockResolvedValueOnce([profile]);
    await render();
    await selectProfile();
    await edit("# keep profile draft\n");
    await act(async () => button("VS Code 打开").click());
    expect(openContainingDirectoryInVscode).toHaveBeenCalledExactlyOnceWith(
      path,
    );
    expect(
      button("VS Code 打开").querySelector(".codicon-vscode"),
    ).not.toBeNull();
    expect(editor().value).toBe("# keep profile draft\n");
    expect(profileButtons()[0].getAttribute("aria-pressed")).toBe("true");
    expect(api.saveSystemHosts).not.toHaveBeenCalled();
  },
);

it("keeps a Hosts draft when VS Code fails and allows retry", async () => {
  await render();
  await edit("# keep system draft\n");
  vi.mocked(openContainingDirectoryInVscode)
    .mockRejectedValueOnce(new Error("VS Code unavailable"))
    .mockResolvedValueOnce();
  await act(async () => button("VS Code 打开").click());
  expect(toast.error).toHaveBeenCalledWith("VS Code unavailable");
  expect(editor().value).toBe("# keep system draft\n");
  expect(button("VS Code 打开").disabled).toBe(false);
  await act(async () => button("VS Code 打开").click());
  expect(openContainingDirectoryInVscode).toHaveBeenCalledTimes(2);
});

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
  path: "/workspace/user-config/hosts/profile-1.hosts",
};
async function selectProfile() {
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('aside button[aria-pressed="false"]')!
      .click(),
  );
}

const profileButtons = () => [
  ...host.querySelectorAll<HTMLButtonElement>("aside button[aria-pressed]"),
];
const activeProfileNames = () =>
  profileButtons()
    .filter((item) =>
      item
        .closest('[role="group"]')
        ?.querySelector('[role="img"][aria-label="当前生效"]'),
    )
    .map((item) => item.querySelector("[title]")?.textContent);

it("automatically shows system content before a slow profile list finishes and preserves typing", async () => {
  let finishProfiles!: (profiles: api.HostsProfile[]) => void;
  vi.mocked(api.listHostsProfiles).mockReturnValueOnce(
    new Promise((resolve) => {
      finishProfiles = resolve;
    }),
  );
  await render();
  expect(api.readSystemHosts).toHaveBeenCalledTimes(1);
  expect(api.listHostsProfiles).toHaveBeenCalledTimes(1);
  expect(editor().disabled).toBe(false);
  expect(editor().value).toBe("127.0.0.1 localhost\n");
  await edit("# typed while loading\n");
  await act(async () => finishProfiles([profile]));
  expect(editor().value).toBe("# typed while loading\n");
  expect(profileButtons()).toHaveLength(1);
});

it("shows selectable profiles before a slow system read finishes without replacing the selection", async () => {
  let finishSystem!: (snapshot: api.HostsSnapshot) => void;
  vi.mocked(api.readSystemHosts).mockReturnValueOnce(
    new Promise((resolve) => {
      finishSystem = resolve;
    }),
  );
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  expect(profileButtons()[0].disabled).toBe(false);
  await selectProfile();
  expect(editor().disabled).toBe(false);
  expect(editor().value).toBe(profile.content);
  await act(async () => finishSystem(initial));
  expect(profileButtons()[0].getAttribute("aria-pressed") === "true").toBe(
    true,
  );
  expect(editor().value).toBe(profile.content);
});

it("keeps the editor usable during explicit reload and preserves edits made after reload started", async () => {
  await render();
  let finishSystem!: (snapshot: api.HostsSnapshot) => void;
  vi.mocked(api.readSystemHosts).mockReturnValueOnce(
    new Promise((resolve) => {
      finishSystem = resolve;
    }),
  );
  await act(async () => button("重新读取").click());
  expect(editor().disabled).toBe(false);
  await edit("# new draft during refresh\n");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(api.readSystemHosts).toHaveBeenCalledTimes(2);
  await act(async () =>
    finishSystem({ ...initial, content: "# external\n", revision: "new" }),
  );
  expect(editor().value).toBe("# new draft during refresh\n");
  expect(host.textContent).toContain("磁盘内容已变化");
});

it("attributes identical contents only to the backend ID and switches only after a successful apply", async () => {
  const first = { ...profile, content: initial.content };
  const second = { ...first, id: "profile-2", name: "Testing" };
  vi.mocked(api.listHostsProfiles).mockResolvedValue([first, second]);
  vi.mocked(api.readSystemHosts).mockResolvedValue({
    ...initial,
    applied_profile_id: first.id,
  });
  await render();
  expect(activeProfileNames()).toEqual([first.name]);
  expect(profileButtons()[0].textContent).toBe(first.name);
  expect(host.querySelector('input[type="radio"]')).toBeNull();
  await act(async () => profileButtons()[0].click());
  expect(
    profileButtons().map(
      (item) => item.getAttribute("aria-pressed") === "true",
    ),
  ).toEqual([true, false]);
  await act(async () => profileButtons()[1].click());
  expect(
    profileButtons().map(
      (item) => item.getAttribute("aria-pressed") === "true",
    ),
  ).toEqual([false, true]);
  expect(button("应用到系统").disabled).toBe(false);
  expect(host.querySelector("h3 .text-success")).toBeNull();
  expect(activeProfileNames()).toEqual([first.name]);

  vi.mocked(api.applyHostsProfile).mockRejectedValueOnce(
    new Error("Authorization cancelled"),
  );
  await act(async () => button("应用到系统").click());
  expect(activeProfileNames()).toEqual([first.name]);

  const applied = { ...initial, applied_profile_id: second.id };
  vi.mocked(api.applyHostsProfile).mockResolvedValueOnce({
    snapshot: applied,
    backup_path: null,
  });
  await act(async () => button("应用到系统").click());
  expect(api.applyHostsProfile).toHaveBeenLastCalledWith(
    second,
    initial.revision,
  );
  expect(activeProfileNames()).toEqual([second.name]);
  expect(button("已应用").disabled).toBe(true);
  expect(button("已应用").querySelectorAll("svg")).toHaveLength(1);
  expect(button("已应用").querySelectorAll("svg path")).toHaveLength(1);

  vi.mocked(api.readSystemHosts).mockResolvedValue(applied);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(activeProfileNames()).toEqual([second.name]);
  await act(async () => profileButtons()[0].click());
  expect(button("应用到系统").disabled).toBe(false);
  expect(activeProfileNames()).toEqual([second.name]);
});

it("does not infer an active profile from identical content when no backend ID is recorded", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([
    { ...profile, content: initial.content },
    { ...profile, id: "profile-2", name: "Testing", content: initial.content },
  ]);
  await render();
  expect(activeProfileNames()).toEqual([]);
  expect(
    host.querySelectorAll("aside button[aria-label^='应用方案']"),
  ).toHaveLength(0);
});

it("clears the badge after saving changes to the active profile without changing the system file", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  vi.mocked(api.readSystemHosts).mockResolvedValue({
    ...initial,
    content: profile.content,
    applied_profile_id: profile.id,
  });
  await render();
  await selectProfile();
  await edit("# changed profile\n");
  vi.mocked(api.updateHostsProfile).mockResolvedValue({
    ...profile,
    content: "# changed profile\n",
    revision: "updated",
  });
  await act(async () => button("保存方案").click());
  expect(activeProfileNames()).toEqual([]);
  expect(button("应用到系统").disabled).toBe(false);
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
});

it.each([
  "/workspace/user-config/hosts/12345678-1234-4234-8234-123456789abc.hosts",
  "C:\\workspace\\user-config\\hosts\\12345678-1234-4234-8234-123456789abc.hosts",
])(
  "shows the full profile path without shortening folders or file names: %s",
  async (path) => {
    vi.mocked(api.listHostsProfiles).mockResolvedValue([{ ...profile, path }]);
    await render();
    await selectProfile();
    const location = host.querySelector("code[title]");
    expect(location?.textContent).toBe(path);
    expect(location?.getAttribute("title")).toBe(path);
    expect(location?.getAttribute("aria-label")).toBe(path);
  },
);

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
    snapshot: {
      ...initial,
      content: updated.content,
      revision: "applied",
      applied_profile_id: updated.id,
    },
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
  expect(profileButtons()[0].getAttribute("aria-pressed") === "true").toBe(
    false,
  );
  await selectProfile();
  await act(async () => button("确认").click());
  expect(editor().value).toBe(profile.content);
  expect(profileButtons()[0].getAttribute("aria-pressed") === "true").toBe(
    true,
  );
});
it("copies the current profile draft from the common toolbar without applying it", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  await edit("# copied draft\n");
  await act(async () => button("复制").click());
  expect(
    document.querySelector<HTMLInputElement>('[role="alertdialog"] input')
      ?.value,
  ).toBe(`${profile.name} 副本`);
  vi.mocked(api.createHostsProfile).mockResolvedValue({
    ...profile,
    id: "profile-copy",
    name: `${profile.name} 副本`,
    content: "# copied draft\n",
  });
  const save = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((item) => item.textContent === "保存")!;
  await act(async () => save.click());
  expect(api.createHostsProfile).toHaveBeenCalledWith(
    `${profile.name} 副本`,
    "# copied draft\n",
  );
  expect(api.applyHostsProfile).not.toHaveBeenCalled();
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
});

it("copies and deletes the right-clicked profile while preserving another profile's draft", async () => {
  const other = {
    ...profile,
    id: "other",
    name: "Production",
    content: "127.0.0.3 production.test\n",
    revision: "other-first",
  };
  const copied = {
    ...other,
    id: "copy",
    name: "Production 副本",
    revision: "copy-first",
  };
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile, other]);
  await render();
  await selectProfile();
  const menu = async (action: string) => {
    await act(async () =>
      host
        .querySelector('[role="group"][aria-label="Production"]')!
        .dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        ),
    );
    const items = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ];
    expect(items.map((item) => item.textContent)).toEqual([
      "重命名",
      "复制",
      "删除",
    ]);
    await act(async () =>
      items.find((item) => item.textContent === action)!.click(),
    );
  };
  await menu("复制");
  expect(
    document.querySelector<HTMLInputElement>('[role="alertdialog"] input')
      ?.value,
  ).toBe(copied.name);
  expect(
    profileButtons().find(
      (item) => item.getAttribute("aria-pressed") === "true",
    )?.textContent,
  ).toBe(profile.name);
  vi.mocked(api.createHostsProfile).mockResolvedValue(copied);
  await act(async () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[role="alertdialog"] button',
      ),
    ]
      .find((item) => item.textContent === "保存")!
      .click(),
  );
  expect(api.createHostsProfile).toHaveBeenCalledWith(
    copied.name,
    other.content,
  );
  await edit("# keep copied draft\n");
  await menu("删除");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    other.name,
  );
  await act(async () => button("取消").click());
  expect(api.deleteHostsProfile).not.toHaveBeenCalled();
  await menu("删除");
  vi.mocked(api.deleteHostsProfile).mockResolvedValue(undefined);
  await act(async () => button("确认").click());
  expect(api.deleteHostsProfile).toHaveBeenCalledExactlyOnceWith(other);
  expect(
    profileButtons().find(
      (item) => item.getAttribute("aria-pressed") === "true",
    )?.textContent,
  ).toBe(copied.name);
  expect(editor().value).toBe("# keep copied draft\n");
  expect(api.applyHostsProfile).not.toHaveBeenCalled();
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
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
  expect(button("重命名")).toBeUndefined();
  await act(async () => {
    host
      .querySelector(`[role="group"][aria-label="${profile.name}"]`)!
      .dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
  });
  await act(async () => button("重命名").click());
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="方案名称"]',
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
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(api.updateHostsProfile).toHaveBeenCalledWith(
    profile,
    "Renamed",
    profile.content,
  );
  expect(editor().value).toBe("# draft\n");
});
it("renames the right-clicked profile without selecting it or losing the current draft", async () => {
  const other = {
    ...profile,
    id: "profile-2",
    name: "Production",
    revision: "other-first",
  };
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile, other]);
  await render();
  await selectProfile();
  await edit("# keep current draft\n");
  await act(async () => {
    host
      .querySelector(`[role="group"][aria-label="${other.name}"]`)!
      .dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
  });
  await act(async () => button("重命名").click());
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="方案名称"]',
  )!;
  expect(input.value).toBe(other.name);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Updated production");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  vi.mocked(api.updateHostsProfile).mockResolvedValue({
    ...other,
    name: "Updated production",
    revision: "other-next",
  });
  await act(async () => input.blur());
  expect(api.updateHostsProfile).toHaveBeenCalledWith(
    other,
    "Updated production",
    other.content,
  );
  expect(
    profileButtons().find(
      (item) => item.getAttribute("aria-pressed") === "true",
    )?.textContent,
  ).toContain(profile.name);
  expect(editor().value).toBe("# keep current draft\n");
});

it("keeps an inline rename after failure, retries once and cancels with Escape", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  await edit("# keep draft\n");
  const openRename = async () => {
    await act(async () =>
      button(profile.name).dispatchEvent(
        new KeyboardEvent("keydown", { key: "F2", bubbles: true }),
      ),
    );
    return host.querySelector<HTMLInputElement>(
      'input[aria-label="方案名称"]',
    )!;
  };
  const type = async (input: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  let input = await openRename();
  await type(input, "  Renamed  ");
  vi.mocked(api.updateHostsProfile).mockRejectedValueOnce(
    new Error("rename failed"),
  );
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(api.updateHostsProfile).toHaveBeenCalledTimes(1);
  expect(input.value).toBe("  Renamed  ");
  expect(document.activeElement).toBe(input);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "rename failed",
  );
  vi.mocked(api.updateHostsProfile).mockResolvedValue({
    ...profile,
    name: "Renamed",
    revision: "next",
  });
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(api.updateHostsProfile).toHaveBeenCalledTimes(2);
  expect(api.updateHostsProfile).toHaveBeenLastCalledWith(
    profile,
    "Renamed",
    profile.content,
  );
  expect(editor().value).toBe("# keep draft\n");
  await act(async () =>
    button("Renamed").dispatchEvent(
      new KeyboardEvent("keydown", { key: "F2", bubbles: true }),
    ),
  );
  input = host.querySelector<HTMLInputElement>('input[aria-label="方案名称"]')!;
  await type(input, "Discard");
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(api.updateHostsProfile).toHaveBeenCalledTimes(2);
  expect(button("Renamed")).toBe(document.activeElement);
  expect(host.querySelector('input[aria-label="方案名称"]')).toBeNull();
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

it("keeps the selected draft when header deletion is cancelled or fails", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  await edit("# unsaved selected profile\n");
  const remove = () =>
    host.querySelector<HTMLButtonElement>('header [aria-label="删除方案"]')!;
  await act(async () => remove().click());
  expect(api.deleteHostsProfile).not.toHaveBeenCalled();
  await act(async () => button("取消").click());
  expect(editor().value).toBe("# unsaved selected profile\n");
  await act(async () => remove().click());
  vi.mocked(api.deleteHostsProfile).mockRejectedValueOnce(
    new Error("disk failure"),
  );
  await act(async () => button("确认").click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(editor().value).toBe("# unsaved selected profile\n");
  expect(profileButtons()[0].getAttribute("aria-pressed")).toBe("true");
  vi.mocked(api.deleteHostsProfile).mockResolvedValueOnce(undefined);
  await act(async () => button("确认").click());
  expect(api.deleteHostsProfile).toHaveBeenLastCalledWith(profile);
  expect(profileButtons()).toHaveLength(0);
  expect(editor().value).toBe(hostsContent());
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
});

it("keeps the selected draft revision when deleting after an external change", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  await edit("# unsaved\n");
  vi.mocked(api.listHostsProfiles).mockResolvedValue([
    { ...profile, revision: "external", content: "# external\n" },
  ]);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="删除方案"]')!.click(),
  );
  vi.mocked(api.deleteHostsProfile).mockRejectedValueOnce(
    new Error("HOSTS_PROFILE_CONFLICT"),
  );
  await act(async () => button("确认").click());
  expect(api.deleteHostsProfile).toHaveBeenCalledWith(profile);
  expect(editor().value).toBe("# unsaved\n");
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
});

it("retries applying the selected saved profile after authorization is cancelled", async () => {
  vi.mocked(api.listHostsProfiles).mockResolvedValue([profile]);
  await render();
  await selectProfile();
  expect(host.textContent).not.toContain("一键应用");
  expect(api.applyHostsProfile).not.toHaveBeenCalled();
  vi.mocked(api.applyHostsProfile).mockRejectedValueOnce(
    new Error("Authorization cancelled"),
  );
  await act(async () => button("应用到系统").click());
  vi.mocked(api.applyHostsProfile).mockResolvedValueOnce({
    snapshot: {
      ...initial,
      content: profile.content,
      revision: "applied",
      applied_profile_id: profile.id,
    },
    backup_path: null,
  });
  await act(async () => button("重新授权并保存").click());
  expect(api.applyHostsProfile).toHaveBeenCalledTimes(2);
  expect(api.applyHostsProfile).toHaveBeenLastCalledWith(profile, "first");
  expect(api.saveSystemHosts).not.toHaveBeenCalled();
  expect(api.updateHostsProfile).not.toHaveBeenCalled();
});
