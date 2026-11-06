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
  try {
    await act(async () => root.render(<Harness />));
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="删除「默认提示词」"]',
      )!.disabled,
    ).toBe(true);
    const add = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "新增方案",
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
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
