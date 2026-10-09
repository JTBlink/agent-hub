import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../i18n/en.json";
import zh from "../i18n/zh.json";
import zhTW from "../i18n/zh-TW.json";
import {
  getSkillGroupDisplayDescription,
  getSkillGroupDisplayName,
} from "./skillGroupDisplay";

describe("default skill group display", () => {
  it("follows language changes without changing stored names", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "zh",
      resources: {
        zh: { translation: zh },
        "zh-TW": { translation: zhTW },
        en: { translation: en },
      },
    });
    const group = Object.freeze({
      name: "Default",
      description: "Default startup scenario",
    });
    for (const [language, name, description] of [
      ["zh", "默认", "默认技能组"],
      ["zh-TW", "預設", "預設技能組"],
      ["en", "Default", "Default skill group"],
    ]) {
      await i18n.changeLanguage(language);
      expect(getSkillGroupDisplayName(group.name, i18n.t)).toBe(name);
      expect(getSkillGroupDisplayDescription(group, i18n.t)).toBe(description);
      expect(getSkillGroupDisplayName("360", i18n.t)).toBe("360");
      expect(getSkillGroupDisplayName("Default tools", i18n.t)).toBe(
        "Default tools",
      );
      expect(
        getSkillGroupDisplayDescription(
          { ...group, description: "My tools" },
          i18n.t,
        ),
      ).toBe("My tools");
    }
    expect(group.name).toBe("Default");
  });
});
