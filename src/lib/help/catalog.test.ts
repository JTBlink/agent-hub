import { expect, it } from "vitest";
import {
  getHelpArticle,
  getHelpArticles,
  helpCatalog,
  searchHelp,
  helpArticleUrl,
} from "./catalog";

it("searches Chinese titles and body content from the offline package", () => {
  expect(searchHelp("团队共享", "zh")[0].id).toBe("project-team-sharing");
  expect(searchHelp("专属设置", "zh").map((article) => article.id)).toContain(
    "backup-sync",
  );
  expect(searchHelp("毫不相关的查询xyz", "zh")).toEqual([]);
});

it("falls back per article to Chinese and builds a share URL independent of source directories", () => {
  expect(getHelpArticle("quick-start", "en")?.locale).toBe("zh");
  expect(getHelpArticles("zh-TW").map((article) => article.id)).toEqual(
    getHelpArticles("zh").map((article) => article.id),
  );
  expect(helpArticleUrl("project-team-sharing", "en", "交付给团队")).toBe(
    `${helpCatalog.siteUrl}en/project-team-sharing.html#%E4%BA%A4%E4%BB%98%E7%BB%99%E5%9B%A2%E9%98%9F`,
  );
  expect(getHelpArticle("unknown", "zh")).toBeUndefined();
});
