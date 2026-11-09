// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import zh from "../i18n/zh.json";
import type { AutomationDraft } from "../lib/tauri";
import { automationPrompts } from "../lib/automationPrompts";
import { AutomationPromptEditor } from "./AutomationPromptEditor";

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

it("adds and edits variants, switches one active body and selects a survivor on deletion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let current: AutomationDraft = {
    name: "Review",
    provider: "hermes",
    content: "Only review",
    workdir: null,
    schedule: { kind: "hourly", minute: 0 },
    enabled: false,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [draft, setDraft] = useState(current);
    useEffect(() => {
      current = draft;
    }, [draft]);
    return (
      <AutomationPromptEditor
        draft={draft}
        disabled={false}
        usesAgent
        inactivePrompt=""
        onChange={(change) =>
          setDraft((previous) => ({ ...previous, ...change }))
        }
      />
    );
  }
  const click = async (selector: string) =>
    act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
  const input = async (
    node: HTMLInputElement | HTMLTextAreaElement,
    text: string,
  ) =>
    act(async () => {
      const prototype =
        node instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
        node,
        text,
      );
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const menu = async (name: string, action: string) => {
    await act(async () =>
      host
        .querySelector(`[role="group"][aria-label="${name}"]`)!
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
    const item = items.find((item) => item.textContent === action)!;
    await act(async () => item.click());
    return item;
  };
  try {
    await act(async () => root.render(<Harness />));
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="删除「默认提示词」"]',
      )!.disabled,
    ).toBe(true);
    expect((await menu("默认提示词", "删除")).disabled).toBe(true);
    await act(async () =>
      document
        .querySelector('[role="menu"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
    );
    const add = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "新增",
    )!;
    await act(async () => add.click());
    expect(host.querySelectorAll('input[type="radio"]:checked')).toHaveLength(
      1,
    );
    await input(
      host.querySelector<HTMLInputElement>('input[aria-label="方案名称"]')!,
      "Repair",
    );
    await input(
      host.querySelector<HTMLTextAreaElement>("textarea")!,
      "Repair and test",
    );
    expect(automationPrompts(current, "Default").activeId).toBe("default");
    await click('button[aria-label="编辑「默认提示词」"]');
    expect(host.querySelector("textarea")!.value).toBe("Only review");
    const next = automationPrompts(current, "Default");
    expect(next.variants[1].content).toBe("Repair and test");
    await click('input[type="radio"]:not([value="default"])');
    expect(host.querySelector("textarea")!.value).toBe("Repair and test");
    await click('button[aria-label="删除「Repair」"]');
    await act(async () => {
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="alertdialog"] button',
        ),
      ]
        .find((button) => button.textContent === "删除")!
        .click();
    });
    expect(automationPrompts(current, "Default").activeId).toBe("default");
    expect(current.content).toBe("Only review");
    expect(host.querySelectorAll('input[type="radio"]:checked')).toHaveLength(
      1,
    );
    const copy = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "复制",
    )!;
    const beforeCopy = automationPrompts(current, "Default");
    const original = beforeCopy.variants.find(
      (variant) => variant.id === beforeCopy.activeId,
    )!;
    await act(async () => copy.click());
    const copied = automationPrompts(current, "Default");
    expect(copied.activeId).toBe(beforeCopy.activeId);
    expect(copied.variants).toHaveLength(2);
    expect(copied.variants[1]).toMatchObject({
      name: `${original.name}（副本）`,
      content: original.content,
    });
    expect(copied.variants[1].id).not.toBe(original.id);
    expect(host.querySelector("textarea")!.value).toBe(original.content);
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="方案名称"]')!
        .value,
    ).toBe(`${original.name}（副本）`);
    await input(
      host.querySelector<HTMLTextAreaElement>("textarea")!,
      "Different viewed draft",
    );
    await menu(original.name, "复制");
    const contextCopy = automationPrompts(current, "Default");
    const newest = contextCopy.variants.at(-1)!;
    expect(newest.content).toBe(original.content);
    expect(contextCopy.activeId).toBe(original.id);
    expect(contextCopy.variants).toHaveLength(3);
    expect(host.querySelector("textarea")!.value).toBe(original.content);
    await menu(original.name, "删除");
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="alertdialog"] button',
        ),
      ]
        .find((button) => button.textContent === "取消")!
        .click(),
    );
    expect(automationPrompts(current, "Default").variants).toHaveLength(3);
    await menu(original.name, "删除");
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="alertdialog"] button',
        ),
      ]
        .find((button) => button.textContent === "删除")!
        .click(),
    );
    const deleted = automationPrompts(current, "Default");
    expect(deleted.variants.map((variant) => variant.id)).not.toContain(
      original.id,
    );
    expect(deleted.variants.map((variant) => variant.id)).toContain(newest.id);
    expect(host.querySelector("textarea")!.value).toBe(original.content);
    expect(current.content).toBe("Different viewed draft");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("keeps the optional behavior marker hidden until advanced settings are opened", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const current: AutomationDraft = {
    name: "Review",
    provider: "hermes",
    content: "Only review",
    workdir: null,
    schedule: { kind: "hourly", minute: 0 },
    enabled: false,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AutomationPromptEditor
          draft={current}
          disabled={false}
          usesAgent
          inactivePrompt=""
          onChange={vi.fn()}
        />,
      ),
    );
    const advanced = host.querySelector<HTMLDetailsElement>("details")!;
    expect(advanced.open).toBe(false);
    await act(async () => advanced.querySelector("summary")!.click());
    expect(advanced.open).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="行为标识"]'),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
