// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import i18n from "../i18n";
import { AutomationVariablesField } from "./AutomationVariablesField";

it("adds and removes rows without a fixed count limit and reports duplicates", async () => {
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
    expect(host.querySelectorAll("input")).toHaveLength(204);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () =>
      buttons()
        .find((b) => b.getAttribute("aria-label") === "移除变量 102")!
        .click(),
    );
    expect(host.querySelectorAll("input")).toHaveLength(202);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
