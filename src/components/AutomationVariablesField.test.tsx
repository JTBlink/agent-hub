// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import i18n from "../i18n";
import { AutomationVariablesField } from "./AutomationVariablesField";

it("requires confirmation before adding a variable and reports invalid drafts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await i18n.changeLanguage("zh");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Fixture() {
    const [variables, update] = useState(
      Array.from({ length: 101 }, (_, n) => ({
        name: `value_${n}`,
        value: String(n),
      })),
    );
    return (
      <AutomationVariablesField
        variables={variables}
        disabled={false}
        onChange={update}
      />
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    const buttons = () => [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ];
    await act(async () =>
      buttons()
        .find((b) => b.textContent?.includes("添加变量"))!
        .click(),
    );
    const variableInputs = () =>
      host.querySelectorAll<HTMLInputElement>(
        'input[aria-label^="变量名称 "], input[aria-label^="变量值 "]',
      );
    expect(variableInputs()).toHaveLength(204);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const draftInputs = variableInputs();
    const type = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      type(draftInputs[202], "value_0");
      type(draftInputs[203], "duplicate");
    });
    await act(async () =>
      buttons()
        .find((b) => b.getAttribute("aria-label") === "确认变量")!
        .click(),
    );
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () =>
      buttons()
        .find((b) => b.getAttribute("aria-label") === "取消添加变量")!
        .click(),
    );
    expect(variableInputs()).toHaveLength(202);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await act(async () =>
      buttons()
        .find((b) => b.textContent?.includes("添加变量"))!
        .click(),
    );
    const savedDraftInputs = variableInputs();
    await act(async () => {
      type(savedDraftInputs[202], "new_variable");
      type(savedDraftInputs[203], "saved");
    });
    await act(async () =>
      buttons()
        .find((b) => b.getAttribute("aria-label") === "确认变量")!
        .click(),
    );
    expect(variableInputs()).toHaveLength(204);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="变量名称 102"]')
        ?.value,
    ).toBe("new_variable");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("edits an existing variable name, value, and description in the task draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await i18n.changeLanguage("zh");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Fixture() {
    const [variables, update] = useState([
      { name: "scope", value: "all", description: "Every author" },
    ]);
    return (
      <>
        <AutomationVariablesField
          variables={variables}
          disabled={false}
          onChange={update}
        />
        <output>{JSON.stringify(variables)}</output>
      </>
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    for (const [label, value] of [
      ["变量名称 1", "repair_scope"],
      ["变量值 1", "own"],
      ["变量描述 1", "Only the authenticated account"],
    ]) {
      const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[aria-label="${label}"]`,
      )!;
      await act(async () => {
        const prototype =
          field instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
          field,
          value,
        );
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(JSON.parse(host.querySelector("output")!.textContent!)).toEqual([
      {
        name: "repair_scope",
        value: "own",
        description: "Only the authenticated account",
      },
    ]);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
