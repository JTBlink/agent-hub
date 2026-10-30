// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import zh from "../i18n/zh.json";
import { Discover } from "./Discover";
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}));
vi.mock("./InstallSkills", () => ({
  InstallSkills: ({ activeTab }: { activeTab: string }) => {
    const [count, setCount] = useState(0);
    return (
      <div data-skill-source={activeTab}>
        <button onClick={() => setCount(count + 1)}>Skill draft {count}</button>
      </div>
    );
  },
}));
vi.mock("../components/discovery/AutomationDiscovery", () => ({
  AutomationDiscovery: ({ source }: { source: string }) => (
    <div data-task-source={source} />
  ),
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Location() {
  return <output>{useLocation().search}</output>;
}
const click = async (label: string) => {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === label && !b.closest("[hidden]"),
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
};
it("keeps legacy source links, independent sources, and mounted Skill drafts", async () => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/install?tab=local"]}>
        <Discover />
        <Location />
      </MemoryRouter>,
    ),
  );
  expect(host.querySelector("h1")?.textContent).toBe("发现");
  expect(
    host
      .querySelector("[data-skill-source]")
      ?.getAttribute("data-skill-source"),
  ).toBe("local");
  await click("Skill draft 0");
  await click("自动化任务");
  await click("Git 安装");
  await click("Skills");
  expect(
    host
      .querySelector("[data-skill-source]")
      ?.getAttribute("data-skill-source"),
  ).toBe("local");
  expect(host.textContent).toContain("Skill draft 1");
  await click("自动化任务");
  expect(
    host.querySelector("[data-task-source]")?.getAttribute("data-task-source"),
  ).toBe("git");
  expect(host.querySelector("output")?.textContent).toContain(
    "automationSource=git",
  );
});
it("supports direct automation links and arrow-key category navigation", async () => {
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={["/discover?type=automations&source=local"]}
      >
        <Discover />
      </MemoryRouter>,
    ),
  );
  expect(
    host.querySelector("[data-task-source]")?.getAttribute("data-task-source"),
  ).toBe("local");
  const tab = host.querySelector<HTMLButtonElement>(
    '[role="tab"][aria-selected="true"]',
  )!;
  await act(async () =>
    tab.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement?.textContent).toBe("Skills");
  expect(document.activeElement?.getAttribute("aria-selected")).toBe("true");
  await click("自动化任务");
  expect(
    host.querySelector("[data-task-source]")?.getAttribute("data-task-source"),
  ).toBe("local");
});
