import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { findHelpArticle } from "../../shared/help-catalog.mjs";
import { locales, readArticle, readNavigation, walkFiles } from "./content.mjs";
import { resolveArticleLinks, websiteContent } from "./links.mjs";

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
function copyHelpAssets(root, target, assets) {
  for (const asset of assets) {
    const output = join(
      target,
      relative(join(root, "docs/help/assets"), asset),
    );
    mkdirSync(dirname(output), { recursive: true });
    cpSync(asset, output);
  }
}
function writeWebsite(root, catalog, pages, assets, changelog) {
  const directory = join(root, "docs-site/.generated");
  rmSync(directory, { recursive: true, force: true });
  copyHelpAssets(root, join(directory, "assets"), assets);
  write(join(directory, "catalog.json"), JSON.stringify(catalog));
  write(
    join(directory, "index.md"),
    "# AgentHub 帮助中心\n\n[中文](zh/index.md) · [English](en/index.md) · [繁體中文](zh-TW/index.md)\n",
  );
  for (const locale of locales) {
    const changelogNotice =
      locale === "en"
        ? "> The changelog is currently available in Chinese. Unreleased entries describe development changes, not released packages.\n\n"
        : locale === "zh-TW"
          ? "> 更新日誌目前提供簡體中文。Unreleased 是開發中的變更，尚未包含在已發布的安裝包中。\n\n"
          : "> Unreleased 是开发中的变更，尚未包含在已发布的安装包中。\n\n";
    write(
      join(directory, locale, "changelog.md"),
      `---\noutline: [2, 3]\neditLink: false\nprev: false\nnext: false\n---\n${changelog.replace(/^(# .+\r?\n)/, `$1\n${changelogNotice}`)}`,
    );
    const list = catalog.navigation.categories.map((category) => {
      const entries = category.articles.map((id) => {
        const article = findHelpArticle(catalog.articles, id, locale);
        return `- [${article.title}](${id}.md) — ${article.description}`;
      });
      return `## ${category.titles[locale]}\n\n${entries.join("\n")}`;
    });
    write(
      join(directory, locale, "index.md"),
      `# AgentHub\n\n${locale === "en" ? "Documentation for version" : "文档适用版本："} ${catalog.version}\n\n${list.join("\n\n")}\n`,
    );
    for (const id of catalog.navigation.categories.flatMap(
      (category) => category.articles,
    )) {
      const article = findHelpArticle(catalog.articles, id, locale);
      const metadata = stringify({
        title: article.title,
        description: article.description,
        outline: [2, 3],
      });
      const notice =
        locale !== article.locale
          ? locale === "en"
            ? "> This article is currently available in Chinese.\n\n"
            : "> 本文目前提供简体中文，翻译尚未完成。\n\n"
          : "";
      const content = pages.get(`${article.locale}/${id}`);
      const related = article.related.length
        ? `\n\n## ${locale === "en" ? "Related articles" : "相关文章"}\n\n${article.related.map((relatedId) => `- [${findHelpArticle(catalog.articles, relatedId, locale).title}](${relatedId}.md)`).join("\n")}\n`
        : "";
      write(
        join(directory, locale, `${id}.md`),
        `---\n${metadata}---\n${notice}> ${locale === "en" ? "Documentation for version:" : "文档适用版本："} ${catalog.version} · ${locale === "en" ? "Since" : "自"} ${article.since}${article.reviewed ? ` · ${locale === "en" ? "Reviewed:" : "核验日期："} ${article.reviewed}` : ""}\n\n${content}${related}`,
      );
      for (const alias of article.aliases)
        write(
          join(directory, locale, `${alias}.md`),
          `---\nsearch: false\n---\n# ${article.title}\n\n[${article.title}](${id}.md)\n`,
        );
    }
  }
}

/** Validate the public content boundary before replacing any generated artifacts. */
export function buildHelp(root, { checkOnly = false } = {}) {
  const source = join(root, "docs/help");
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const version = readFileSync(join(root, "VERSION"), "utf8").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version))
    throw new Error("Invalid application VERSION");
  const navigation = readNavigation(source);
  const files = walkFiles(source);
  const all = files
    .filter(
      (path) =>
        path.endsWith(".md") &&
        locales.includes(relative(source, path).split(/[\\/]/)[0]),
    )
    .map((path) => readArticle(path, source, version));
  const keys = new Set();
  const allIds = new Set(all.map((article) => article.id));
  const aliases = new Map();
  for (const article of all) {
    const key = `${article.locale}/${article.id}`;
    if (keys.has(key))
      throw new Error(`${article.file}: duplicate article id ${article.id}`);
    keys.add(key);
    for (const alias of article.aliases) {
      if (
        allIds.has(alias) ||
        (aliases.has(alias) && aliases.get(alias) !== article.id)
      )
        throw new Error(`${article.file}: alias collision ${alias}`);
      aliases.set(alias, article.id);
    }
  }
  const articles = all.filter((article) => !article.draft && !article.future);
  const canonical = new Map(
    articles
      .filter((article) => article.locale === "zh")
      .map((article) => [article.id, article]),
  );
  const byPath = new Map(articles.map((article) => [article.path, article]));
  const categories = new Map(
    navigation.categories.flatMap((category) =>
      category.articles.map((id) => [id, category.id]),
    ),
  );
  for (const id of categories.keys())
    if (!canonical.has(id))
      throw new Error(`navigation: missing published Chinese article ${id}`);
  const publishedAliases = new Map();
  for (const article of articles) {
    const entries = publishedAliases.get(article.id) ?? new Set();
    for (const alias of article.aliases) entries.add(alias);
    publishedAliases.set(article.id, entries);
  }
  const pages = new Map();
  const assets = new Set();
  for (const article of articles) {
    if (!canonical.has(article.id))
      throw new Error(
        `${article.file}: translation has no published Chinese article`,
      );
    if (!categories.has(article.id))
      throw new Error(`${article.file}: article missing from navigation`);
    for (const id of article.related)
      if (!canonical.has(id))
        throw new Error(`${article.file}: missing related article ${id}`);
    const resolved = resolveArticleLinks(article, byPath, source);
    for (const asset of resolved.assets) assets.add(asset);
    article.aliases = [...publishedAliases.get(article.id)];
    pages.set(
      `${article.locale}/${article.id}`,
      websiteContent(article, resolved.replacements),
    );
    article.category = categories.get(article.id);
  }
  const homepage = new URL(
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")).homepage,
  );
  const siteUrl = new URL(
    "docs/",
    homepage.href.endsWith("/") ? homepage : `${homepage.href}/`,
  ).href;
  const catalog = {
    version,
    siteUrl,
    locales,
    defaultLocale: "zh",
    navigation,
    articles: articles.map(
      ({
        path: _path,
        file: _file,
        tree: _tree,
        draft: _draft,
        future: _future,
        ...article
      }) => article,
    ),
  };
  if (!checkOnly) {
    const appDirectory = join(root, "src/generated/help");
    rmSync(appDirectory, { recursive: true, force: true });
    write(
      join(appDirectory, "catalog.json"),
      `${JSON.stringify(catalog, null, 2)}\n`,
    );
    write(
      join(appDirectory, "catalog.ts"),
      `// Generated from docs/help; do not edit.\nimport type { HelpCatalog } from "../../lib/help/types";\nconst catalog: HelpCatalog = ${JSON.stringify(catalog, null, 2)};\nexport default catalog;\n`,
    );
    const assetDirectory = join(root, "public/help-assets");
    rmSync(assetDirectory, { recursive: true, force: true });
    copyHelpAssets(root, assetDirectory, assets);
    writeWebsite(root, catalog, pages, assets, changelog);
  }
  return catalog;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const catalog = buildHelp(
    resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
    { checkOnly: process.argv.includes("--check") },
  );
  console.log(
    `Help content validated: ${catalog.articles.length} articles, version ${catalog.version}`,
  );
}
