import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildHelp } from "./build-help.mjs";

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agenthub-help-"));
  roots.push(root);
  mkdirSync(join(root, "docs/help/zh/guides"), { recursive: true });
  writeFileSync(join(root, "VERSION"), "0.1.4\n");
  writeFileSync(
    join(root, "CHANGELOG.md"),
    "# 更新日志\n\n## [Unreleased]\n\n开发变更。\n",
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ homepage: "https://example.invalid/agent-hub/" }),
  );
  writeFileSync(
    join(root, "docs/help/navigation.yml"),
    "categories:\n  - id: start\n    articles: [first]\nfeatured: [first]\n",
  );
  writeFileSync(
    join(root, "docs/help/zh/guides/first.md"),
    "---\nid: first\ntitle: 第一次部署\ndescription: 使用项目技能。\ntags: [团队]\nsince: '0.1.4'\n---\n# 第一次部署\n\n## 操作步骤\n\n项目技能随 Git 共享。\n",
  );
  return root;
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);

it("publishes the source changelog in every website locale and refreshes it without adding offline articles", () => {
  const root = fixture();
  const initial = buildHelp(root);
  expect(initial.articles.map((article) => article.id)).toEqual(["first"]);
  for (const locale of ["zh", "en", "zh-TW"]) {
    const page = readFileSync(
      join(root, "docs-site/.generated", locale, "changelog.md"),
      "utf8",
    );
    expect(page).toContain("## [Unreleased]");
    expect(page).toContain("开发变更。");
  }
  expect(
    readFileSync(join(root, "docs-site/.generated/en/changelog.md"), "utf8"),
  ).toContain("available in Chinese");
  writeFileSync(
    join(root, "CHANGELOG.md"),
    "# 更新日志\n\n## [0.1.4]\n\n发布变更。\n",
  );
  buildHelp(root);
  const updated = readFileSync(
    join(root, "docs-site/.generated/zh/changelog.md"),
    "utf8",
  );
  expect(updated).toContain("发布变更。");
  expect(updated).not.toContain("开发变更。");
});

it("publishes one Markdown article as both offline content and a stable website page", () => {
  const root = fixture();
  const catalog = buildHelp(root);
  expect(catalog.version).toBe("0.1.4");
  expect(catalog.articles[0]).toMatchObject({
    id: "first",
    category: "start",
    title: "第一次部署",
  });
  expect(catalog.articles[0].content).toContain("项目技能随 Git 共享。");
  expect(
    readFileSync(join(root, "src/generated/help/catalog.json"), "utf8"),
  ).toContain("项目技能随 Git 共享。");
  expect(
    readFileSync(join(root, "docs-site/.generated/zh/first.md"), "utf8"),
  ).toContain("项目技能随 Git 共享。");
  expect(catalog.articles[0].headings.map((heading) => heading.id)).toEqual([
    "第一次部署",
    "操作步骤",
  ]);
  expect(
    readFileSync(join(root, "docs-site/.generated/zh/first.md"), "utf8"),
  ).toContain("文档适用版本： 0.1.4");
});

it("keeps article links, Chinese section anchors and local images usable when source files move", () => {
  const root = fixture();
  mkdirSync(join(root, "docs/help/assets"));
  writeFileSync(
    join(root, "docs/help/assets/example.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  writeFileSync(
    join(root, "docs/help/zh/guides/second.md"),
    "---\nid: second\ntitle: 团队使用\ndescription: 团队交付。\nsince: '0.1.4'\n---\n# 团队使用\n\n## 操作步骤\n\n拉取项目。\n",
  );
  writeFileSync(
    join(root, "docs/help/navigation.yml"),
    "categories:\n  - id: start\n    articles: [first, second]\nfeatured: [first]\n",
  );
  const first = join(root, "docs/help/zh/guides/first.md");
  writeFileSync(
    first,
    readFileSync(first, "utf8") +
      "\n[团队](second.md#操作步骤)\n\n![示意](../../assets/example.svg)\n",
  );
  const catalog = buildHelp(root);
  expect(catalog.articles[0].links["second.md#操作步骤"]).toEqual({
    kind: "article",
    id: "second",
    locale: "zh",
    hash: "操作步骤",
  });
  expect(catalog.articles[1].headings).toContainEqual({
    id: "操作步骤",
    text: "操作步骤",
    depth: 2,
    line: 3,
  });
  const page = readFileSync(
    join(root, "docs-site/.generated/zh/first.md"),
    "utf8",
  );
  expect(page).toContain("(../zh/second.md#操作步骤)");
  expect(page).toContain("(../assets/example.svg)");
  expect(
    readFileSync(join(root, "public/help-assets/example.svg"), "utf8"),
  ).toContain("<svg");
});

it.each([
  [
    "duplicate article id",
    (root) =>
      writeFileSync(
        join(root, "docs/help/zh/duplicate.md"),
        readFileSync(join(root, "docs/help/zh/guides/first.md"), "utf8"),
      ),
    /duplicate article id/,
  ],
  [
    "missing article",
    (root) =>
      writeFileSync(
        join(root, "docs/help/navigation.yml"),
        "categories:\n  - id: start\n    articles: [missing]\n",
      ),
    /missing published/,
  ],
  [
    "broken section",
    (root) => append(root, "[步骤](#不存在)"),
    /missing section/,
  ],
  [
    "outside image",
    (root) => append(root, "![图片](../../../../package.json)"),
    /unsafe image/,
  ],
  [
    "executable link",
    (root) => append(root, "[运行](javascript:alert)"),
    /unsupported link/,
  ],
  [
    "HTML",
    (root) => append(root, "<script>alert(1)</script>"),
    /standard Markdown/,
  ],
  [
    "symbolic link",
    (root) => symlinkSync(join(root, "VERSION"), join(root, "docs/help/leak")),
    /Symbolic links/,
  ],
])("rejects %s before publishing content", (_, invalidate, message) => {
  const root = fixture();
  buildHelp(root);
  const previous = readFileSync(
    join(root, "src/generated/help/catalog.json"),
    "utf8",
  );
  invalidate(root);
  expect(() => buildHelp(root)).toThrow(message);
  expect(
    readFileSync(join(root, "src/generated/help/catalog.json"), "utf8"),
  ).toBe(previous);
});

function append(root, text) {
  const path = join(root, "docs/help/zh/guides/first.md");
  writeFileSync(path, readFileSync(path, "utf8") + `\n${text}\n`);
}

it("visits each heading once across intervening prose and gives repeated titles distinct anchors", () => {
  const root = fixture();
  append(root, "## 操作步骤\n\n另一个章节。");
  expect(
    buildHelp(root).articles[0].headings.map((heading) => heading.id),
  ).toEqual(["第一次部署", "操作步骤", "操作步骤-1"]);
});

it("excludes drafts and future features and removes deleted generated pages on rebuild", () => {
  const root = fixture();
  const raw = readFileSync(join(root, "docs/help/zh/guides/first.md"), "utf8");
  writeFileSync(
    join(root, "docs/help/zh/draft.md"),
    raw.replace("id: first", "id: draft\ndraft: true"),
  );
  writeFileSync(
    join(root, "docs/help/zh/future.md"),
    raw.replace("id: first", "id: future").replace("'0.1.4'", "'0.2.0'"),
  );
  const catalog = buildHelp(root);
  expect(catalog.articles.map((article) => article.id)).toEqual(["first"]);
  writeFileSync(join(root, "docs-site/.generated/zh/removed.md"), "obsolete");
  buildHelp(root);
  expect(() =>
    readFileSync(join(root, "docs-site/.generated/zh/removed.md")),
  ).toThrow();
  expect(
    readFileSync(join(root, "docs-site/.generated/en/first.md"), "utf8"),
  ).toContain("currently available in Chinese");
});

it("keeps an old article id usable as an alias without exposing drafts through links", () => {
  const root = fixture();
  const path = join(root, "docs/help/zh/guides/first.md");
  const raw = readFileSync(path, "utf8");
  writeFileSync(
    path,
    raw.replace("id: first", "id: first\naliases: [previous]"),
  );
  const catalog = buildHelp(root);
  expect(catalog.articles[0].aliases).toEqual(["previous"]);
  expect(
    readFileSync(join(root, "docs-site/.generated/zh/previous.md"), "utf8"),
  ).toContain("(first.md)");
  writeFileSync(
    join(root, "docs/help/zh/guides/draft.md"),
    raw.replace("id: first", "id: draft\ndraft: true"),
  );
  append(root, "[草稿](draft.md)");
  expect(() => buildHelp(root)).toThrow(/broken article link/);
});

it("preserves source-language section links and global aliases when a translation is added", () => {
  const root = fixture();
  const second =
    "---\nid: second\naliases: [old-second]\ntitle: 团队使用\ndescription: 团队交付。\nsince: '0.1.4'\n---\n# 团队使用\n\n## 中文步骤\n\n拉取项目。\n";
  writeFileSync(join(root, "docs/help/zh/guides/second.md"), second);
  mkdirSync(join(root, "docs/help/en"));
  writeFileSync(
    join(root, "docs/help/en/second.md"),
    "---\nid: second\ntitle: Team guide\ndescription: Share with the team.\nsince: '0.1.4'\n---\n# Team guide\n\n## English steps\n\nPull the project.\n",
  );
  writeFileSync(
    join(root, "docs/help/navigation.yml"),
    "categories:\n  - id: start\n    articles: [first, second]\nfeatured: [first]\n",
  );
  append(root, "[团队](second.md#中文步骤)");
  const catalog = buildHelp(root);
  expect(
    readFileSync(join(root, "docs-site/.generated/en/first.md"), "utf8"),
  ).toContain("(../zh/second.md#中文步骤)");
  expect(
    readFileSync(join(root, "docs-site/.generated/en/old-second.md"), "utf8"),
  ).toContain("(second.md)");
  expect(
    catalog.articles.find(
      (article) => article.id === "second" && article.locale === "en",
    ).aliases,
  ).toEqual(["old-second"]);
});

it("does not bundle assets that are only used by unpublished content", () => {
  const root = fixture();
  mkdirSync(join(root, "docs/help/assets"));
  writeFileSync(
    join(root, "docs/help/assets/unpublished.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  buildHelp(root);
  expect(() =>
    readFileSync(join(root, "public/help-assets/unpublished.svg")),
  ).toThrow();
  expect(() =>
    readFileSync(join(root, "docs-site/.generated/assets/unpublished.svg")),
  ).toThrow();
});
