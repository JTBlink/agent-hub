// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import zh from "../../i18n/zh.json";
import { GitTagActionsProvider } from "./GitTagActionsProvider";
import { GitReferenceSummary } from "./GitReferenceSummary";
import { GitGraphRefBadges } from "./GitGraphRefBadges";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
const name = "archive/releases/v1.0";
const sha = "a".repeat(40);
const openGraph = vi.fn();
const refresh = vi.fn();
let host: HTMLDivElement;
let root: Root;
function Harness({
  busy = false,
  scope = "demo",
}: {
  busy?: boolean;
  scope?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <GitTagActionsProvider
      key={scope}
      target={{ projectId: scope, worktreePath: "/workspace/demo" }}
      busy={busy}
      openGraph={openGraph}
      refresh={refresh}
      onRun={async (operation) => {
        try {
          await operation();
          return true;
        } catch {
          return false;
        }
      }}
    >
      <details
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <GitReferenceSummary
          entry={{ kind: "tags", name, sha }}
          expanded={expanded}
          onExpandedChange={setExpanded}
          onRefresh={refresh}
        />
      </details>
      <GitGraphRefBadges
        refs={[{ name, kind: "tag", remote: false }]}
        sha={sha}
        color={0}
        onDetails={() => {}}
      />
    </GitTagActionsProvider>
  );
}
const buttons = () => [
  ...document.querySelectorAll<HTMLButtonElement>("button"),
];
const button = (label: string) =>
  buttons().find((item) => item.textContent === label)!;
async function click(label: string) {
  await act(async () => button(label).click());
}
async function open(selector = "summary") {
  await act(async () =>
    host.querySelector(selector)!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      }),
    ),
  );
}
async function key(element: Element, key: string) {
  await act(async () =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    ),
  );
}
async function type(value: string) {
  const input = document.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(writeText).mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("shares tag commands between the list and graph, preserves copy, disclosure and graph focus", async () => {
  for (const selector of ["summary", '[data-graph-ref="tag"]']) {
    await open(selector);
    const labels = [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent,
    );
    expect(labels.slice(0, 5)).toEqual([
      "在提交图中打开",
      "检出标签…",
      "推送标签…",
      "删除标签…",
      "创建分支…",
    ]);
    await click("复制标签名");
    expect(writeText).toHaveBeenLastCalledWith(name);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await open(selector);
    await click("在提交图中打开");
    expect(openGraph).toHaveBeenLastCalledWith(sha);
  }
  expect(host.querySelector("details")!.open).toBe(false);
  await open();
  expect(button("折叠").disabled).toBe(true);
  await click("展开");
  expect(host.querySelector("details")!.open).toBe(true);
  await open();
  await click("折叠");
  expect(host.querySelector("details")!.open).toBe(false);
  await open();
  await click("刷新");
  expect(refresh).toHaveBeenCalledOnce();
  expect(invoke).not.toHaveBeenCalled();
});

it("creates from the selected tag, keeps failed input and blocks duplicate Enter submissions", async () => {
  await open();
  await click("创建分支…");
  expect(document.activeElement?.tagName).toBe("INPUT");
  await key(document.activeElement!, "Enter");
  expect(invoke).not.toHaveBeenCalled();
  const input = await type("topic/from-tag");
  vi.mocked(invoke).mockRejectedValueOnce(new Error("Branch already exists"));
  await key(input, "Enter");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Branch already exists",
  );
  expect(input.value).toBe("topic/from-tag");
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  let done: (value: unknown) => void = () => {};
  vi.mocked(invoke).mockReturnValueOnce(
    new Promise((resolve) => {
      done = resolve;
    }),
  );
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke).toHaveBeenLastCalledWith("run_project_git_tag_action", {
    projectId: "demo",
    worktreePath: "/workspace/demo",
    request: {
      action: "create_branch",
      tag: name,
      expectedSha: sha,
      branch: "topic/from-tag",
      remote: undefined,
    },
  });
  await key(input, "Escape");
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () => done(undefined));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector("summary"));
});

it("requires an explicit remote selection and keeps failed push attempts retryable", async () => {
  vi.mocked(invoke).mockResolvedValueOnce([
    { name: "first", url: "" },
    { name: "second", url: "" },
  ]);
  await open();
  await click("推送标签…");
  expect(button("推送标签").disabled).toBe(true);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((item) => item.textContent === "second")!
      .click(),
  );
  vi.mocked(invoke).mockRejectedValueOnce(new Error("Remote rejected the tag"));
  await click("推送标签");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Remote rejected the tag",
  );
  expect(document.querySelector('[role="combobox"]')?.textContent).toContain(
    "second",
  );
  vi.mocked(invoke).mockResolvedValueOnce(undefined);
  await click("推送标签");
  expect(invoke).toHaveBeenLastCalledWith(
    "run_project_git_tag_action",
    expect.objectContaining({
      request: expect.objectContaining({
        action: "push",
        remote: "second",
        tag: name,
      }),
    }),
  );
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it("cancels deletes without writing, disables writes while busy and drops a dialog on scope change", async () => {
  await open();
  await click("删除标签…");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "远程仓库中的标签会保留",
  );
  await click("取消");
  expect(invoke).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness busy />));
  await open();
  expect(button("检出标签…").disabled).toBe(true);
  expect(button("删除标签…").disabled).toBe(true);
  await key(document.activeElement!, "Escape");
  await act(async () => root.render(<Harness />));
  await open();
  await click("检出标签…");
  await act(async () => root.render(<Harness scope="other" />));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});

it("retries remote reads and prevents pushing when no remotes exist", async () => {
  vi.mocked(invoke).mockRejectedValueOnce(
    new Error("Configuration unavailable"),
  );
  await open();
  await click("推送标签…");
  expect(button("推送标签").disabled).toBe(true);
  vi.mocked(invoke).mockResolvedValueOnce([]);
  await click("重试");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    t("git.actions.noRemotes"),
  );
  expect(button("推送标签").disabled).toBe(true);
  await click("取消");
  expect(invoke).toHaveBeenCalledTimes(2);
});
