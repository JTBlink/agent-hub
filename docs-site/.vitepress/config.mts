import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { slug } from "github-slugger";
import { tokenizeHelp } from "../../shared/help-search.mjs";
import { findHelpArticle } from "../../shared/help-catalog.mjs";
import type { HelpCatalog } from "../../src/lib/help/types";
import { helpContentPlugin } from "../../scripts/docs/vite-plugin.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const catalog: HelpCatalog = JSON.parse(
  readFileSync(new URL("../.generated/catalog.json", import.meta.url), "utf8"),
);
const labels = {
  zh: {
    label: "简体中文",
    lang: "zh-CN",
    title: "帮助中心",
    search: "搜索文档",
    back: "返回产品首页",
  },
  en: {
    label: "English",
    lang: "en",
    title: "Help center",
    search: "Search documentation",
    back: "Product home",
  },
  "zh-TW": {
    label: "繁體中文",
    lang: "zh-TW",
    title: "說明中心",
    search: "搜尋文件",
    back: "產品首頁",
  },
};

export default defineConfig({
  title: "AgentHub",
  description: "AgentHub 操作指南、技能推荐与故障排查",
  base: new URL(catalog.siteUrl).pathname,
  srcDir: ".generated",
  outDir: "../_site/docs",
  cleanUrls: false,
  lastUpdated: false,
  markdown: { anchor: { slugify: slug } },
  vite: { plugins: [helpContentPlugin(root)] },
  locales: Object.fromEntries(
    Object.entries(labels).map(([locale, text]) => [
      locale,
      {
        label: text.label,
        lang: text.lang,
        title: `AgentHub · ${text.title}`,
        themeConfig: {
          nav: [
            { text: text.title, link: `/${locale}/` },
            { text: text.back, link: new URL("../", catalog.siteUrl).href },
          ],
          sidebar: catalog.navigation.categories.map(
            (category: {
              titles: Record<string, string>;
              articles: string[];
            }) => ({
              text: category.titles[locale],
              items: category.articles.map((id) => ({
                text:
                  findHelpArticle(catalog.articles, id, locale)?.title ?? id,
                link: `/${locale}/${id}`,
              })),
            }),
          ),
          outline: { label: locale === "en" ? "On this page" : "本页目录" },
          footer: {
            message: `${locale === "en" ? "Documentation for version" : "文档适用版本："} ${catalog.version}`,
          },
        },
      },
    ]),
  ),
  themeConfig: {
    search: {
      provider: "local",
      options: {
        miniSearch: {
          options: { tokenize: tokenizeHelp },
          searchOptions: { combineWith: "AND" },
        },
        locales: Object.fromEntries(
          Object.entries(labels).map(([locale, text]) => [
            locale,
            {
              translations: {
                button: {
                  buttonText: text.search,
                  buttonAriaLabel: text.search,
                },
              },
            },
          ]),
        ),
      },
    },
  },
});
