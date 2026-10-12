// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import zhTW from "../i18n/zh-TW.json";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import { makeSkillGroup } from "../../tests/fixtures/skillGroup";
import { SkillGroupSwitchMenu } from "./SkillGroupSwitchMenu";
import { applyTextSize } from "../lib/textScale";

const i18n = createInstance();
await i18n.init({
  lng: "zh",
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    "zh-TW": { translation: zhTW },
  },
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: feedback }));
const groups = [
  makeSkillGroup("dev", "dev-tools"),
  makeSkillGroup("docs", "docs"),
];
const onSwitch = vi.fn();
const onRemove = vi.fn();
const onParentClick = vi.fn();
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.clearAllMocks();
  onSwitch.mockReset().mockResolvedValue(undefined);
  onRemove.mockReset().mockResolvedValue(undefined);
  await i18n.changeLanguage("zh");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  applyTextSize("default");
});

it("anchors the menu to its trigger when app text is enlarged", async () => {
  applyTextSize("xlarge");
  await render();
  vi.spyOn(trigger(), "getBoundingClientRect").mockReturnValue(
    new DOMRect(120, 120, 120, 24),
  );
  await act(async () => trigger().click());
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(Number.parseFloat(menu.style.left) * 1.2).toBe(120);
  expect(Number.parseFloat(menu.style.top) * 1.2).toBeCloseTo(148.8);
});
async function render(groupIds: string[] = [], available = groups) {
  await act(async () =>
    root.render(
      <div onClick={onParentClick}>
        <SkillGroupSwitchMenu
          skill={{ ...makeSkill(1), skill_group_ids: groupIds }}
          skillGroups={available}
          groupNameMap={new Map(groups.map((group) => [group.id, group.name]))}
          onSwitch={onSwitch}
          onRemove={onRemove}
        />
      </div>,
    ),
  );
}
function trigger() {
  return container.querySelector<HTMLButtonElement>("button")!;
}
function options() {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
}

it.each(["zh", "en", "zh-TW"])(
  "adds an ungrouped skill to the chosen group with localized feedback in %s",
  async (language) => {
    await i18n.changeLanguage(language);
    await render();
    expect(trigger().textContent).toBe(i18n.t("mySkills.membership.add"));
    await act(async () => trigger().click());
    expect(options().map((button) => button.textContent)).toEqual([
      "dev-tools",
      "docs",
    ]);
    await act(async () => options()[0].click());
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("skill-1", "dev");
    expect(onRemove).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(feedback.success).toHaveBeenCalledWith(
      i18n.t("mySkills.membership.added", {
        skill: "demo-skill-1",
        group: "dev-tools",
      }),
    );
  },
);

it("keeps group switching and removal available for an assigned skill", async () => {
  await render(["dev"]);
  expect(trigger().textContent).toBe("dev-tools");
  await act(async () => trigger().click());
  expect(options()[0].getAttribute("aria-current")).toBe("true");
  await act(async () => options()[0].click());
  expect(onSwitch).not.toHaveBeenCalled();
  await act(async () => options()[1].click());
  expect(onSwitch).toHaveBeenCalledExactlyOnceWith("skill-1", "docs");
  await act(async () => trigger().click());
  await act(async () => options()[2].click());
  expect(onRemove).toHaveBeenCalledExactlyOnceWith("skill-1", "dev");
});

it("disables the ungrouped entry with guidance when no groups exist", async () => {
  await render([], []);
  expect(trigger().disabled).toBe(true);
  expect(trigger().title).toBe(i18n.t("mySkills.membership.chooseGroup"));
});

it("supports arrow keys and restores focus to the trigger on Escape", async () => {
  await render();
  await act(async () => trigger().click());
  expect(document.activeElement).toBe(options()[0]);
  await act(async () =>
    options()[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(options()[1]);
  await act(async () =>
    options()[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(options()[0]);
  await act(async () =>
    options()[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger());
});

it("prevents duplicate assignments and keeps the menu available after failure", async () => {
  let rejectRequest: (reason: Error) => void = () => {};
  onSwitch.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectRequest = reject;
      }),
  );
  await render();
  await act(async () => {
    trigger().click();
  });
  await act(async () => {
    options()[0].click();
    options()[1].click();
  });
  expect(onSwitch).toHaveBeenCalledTimes(1);
  expect(options().every((button) => button.disabled)).toBe(true);
  await act(async () => rejectRequest(new Error("Assignment failed")));
  expect(feedback.error).toHaveBeenCalledWith("Assignment failed");
  expect(options().every((button) => !button.disabled)).toBe(true);
  await act(async () => options()[1].click());
  expect(onSwitch).toHaveBeenLastCalledWith("skill-1", "docs");
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
