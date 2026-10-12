// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import { Help } from "./Help";
import { getHelpArticle, helpCatalog } from "../lib/help/catalog";

const external = vi.hoisted(() => ({ openUrl: vi.fn(), writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: external.openUrl }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: external.writeText,
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  external.openUrl.mockResolvedValue(undefined);
  external.writeText.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(path = "/help", language = "zh") {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    resources: { zh: { translation: zh }, en: { translation: en } },
  });
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/help" element={<Help />} />
            <Route path="/help/:articleId" element={<Help />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    ),
  );
}
async function clickArticle(id: string) {
  const link = container.querySelector<HTMLAnchorElement>(
    `a[href="/help/${id}"]`,
  );
  expect(link).not.toBeNull();
  await act(async () => link?.click());
}

it("lets a user open an offline article and follow its internal guide link", async () => {
  await render();
  await clickArticle("quick-start");
  expect(container.querySelector("article")?.textContent).toContain(
    "导入技能库",
  );
  expect(
    container
      .querySelector<HTMLImageElement>("article img")
      ?.getAttribute("src"),
  ).toBe("/help-assets/workflow.svg");
  const bodyLink = container.querySelector<HTMLAnchorElement>(
    'article a[href="/help/project-team-sharing?lang=zh"]',
  );
  expect(bodyLink).not.toBeNull();
  await act(async () => bodyLink?.click());
  expect(container.querySelector("article")?.textContent).toContain(
    "管理清单，可选共享",
  );
  expect(external.openUrl).not.toHaveBeenCalled();
});

async function enterQuery(value: string) {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="搜索帮助文档"]',
  );
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("searches article body text and restores browsing after a query with no results", async () => {
  await render();
  await enterQuery("专属设置");
  const main = container.querySelector("main");
  expect(main?.textContent).toContain("备份与多设备同步");
  expect(main?.textContent).not.toContain("从这里开始");
  await enterQuery("找不到的abcdef查询");
  expect(main?.textContent).toContain("没有找到匹配文章");
  const reset = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "清除搜索与筛选",
  );
  await act(async () => reset?.click());
  expect(main?.textContent).toContain("从这里开始");
});

it("opens section anchors and copies an article-specific share URL", async () => {
  await render("/help/project-team-sharing");
  const tocLink = container.querySelector<HTMLAnchorElement>(
    'nav[aria-label="本页目录"] a',
  );
  expect(tocLink).not.toBeNull();
  await act(async () => tocLink?.click());
  expect(document.activeElement?.id).toBe("添加到项目");
  const copy = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "复制分享链接",
  );
  await act(async () => copy?.click());
  expect(external.writeText.mock.calls[0][0]).toMatch(
    /\/docs\/zh\/project-team-sharing\.html#%E6%B7%BB/,
  );
});

it("shows a translated interface with an explicit per-article Chinese fallback", async () => {
  await render("/help/quick-start", "en");
  expect(container.textContent).toContain("Open in browser");
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "currently available in Chinese",
  );
  expect(container.querySelector("article")?.textContent).toContain(
    "导入技能库",
  );
});

it("offers a recovery link for an unavailable article", async () => {
  await render("/help/unavailable");
  expect(container.textContent).toContain("这篇文章不存在");
  const recovery = container.querySelector<HTMLAnchorElement>(
    '[role="status"] a[href="/help"]',
  );
  await act(async () => recovery?.click());
  expect(container.querySelector("main")?.textContent).toContain("从这里开始");
});

it("keeps reading available for an invalid URL fragment", async () => {
  await render("/help/quick-start#%");
  expect(container.querySelector("article")?.textContent).toContain(
    "导入技能库",
  );
});

it("keeps a Chinese fallback article's link on its source language when the target has a translation", async () => {
  const chinese = getHelpArticle("project-team-sharing", "zh");
  if (!chinese) throw new Error("Expected the shared guide fixture");
  helpCatalog.articles.push({
    ...chinese,
    locale: "en",
    title: "Team guide",
    content: "# Team guide\n\n## English steps\n\nTranslated content.",
    headings: [
      { id: "team-guide", text: "Team guide", depth: 1, line: 1 },
      { id: "english-steps", text: "English steps", depth: 2, line: 3 },
    ],
  });
  try {
    await render("/help/quick-start", "en");
    const link = container.querySelector<HTMLAnchorElement>(
      'article a[href="/help/project-team-sharing?lang=zh"]',
    );
    expect(link).not.toBeNull();
    await act(async () => link?.click());
    expect(container.querySelector("article")?.textContent).toContain(
      "交付给团队",
    );
    expect(container.querySelector("article")?.textContent).not.toContain(
      "Translated content",
    );
  } finally {
    helpCatalog.articles.pop();
  }
});
