import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import GithubSlugger from "github-slugger";

const parser = unified().use(remarkParse).use(remarkGfm);
export const locales = ["zh", "en", "zh-TW"];
const validId = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export function textOf(node) {
  return node.value ?? node.alt ?? (node.children ?? []).map(textOf).join("");
}
export function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      if (entry.isSymbolicLink())
        throw new Error(
          `Symbolic links are not allowed in help content: ${entry.name}`,
        );
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(path) : [path];
    });
}
function strings(value, field, file) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    throw new Error(`${file}: ${field} must be a list of nonempty strings`);
  return value;
}
export function readArticle(path, source, version) {
  const file = relative(source, path).replaceAll("\\", "/");
  const locale = file.split("/")[0];
  if (!locales.includes(locale)) throw new Error(`${file}: unsupported locale`);
  const raw = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing YAML frontmatter`);
  const data = parse(match[1]);
  if (!data || !validId.test(data.id))
    throw new Error(`${file}: invalid article id`);
  for (const field of ["title", "description", "since"]) {
    if (typeof data[field] !== "string" || !data[field].trim())
      throw new Error(`${file}: missing ${field}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(data.since))
    throw new Error(`${file}: invalid since version`);
  if (data.draft !== undefined && typeof data.draft !== "boolean")
    throw new Error(`${file}: draft must be boolean`);
  if (
    data.reviewed !== undefined &&
    (typeof data.reviewed !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.reviewed))
  )
    throw new Error(`${file}: reviewed must be YYYY-MM-DD`);
  const tags = strings(data.tags, "tags", file);
  const related = strings(data.related, "related", file);
  const aliases = strings(data.aliases, "aliases", file);
  if (aliases.some((id) => !validId.test(id)))
    throw new Error(`${file}: invalid alias`);
  const content = match[2];
  const tree = parser.parse(content);
  const slugger = new GithubSlugger();
  const headings = [];
  visit(tree, "heading", (node) => {
    headings.push({
      id: slugger.slug(textOf(node)),
      text: textOf(node),
      depth: node.depth,
      line: node.position.start.line,
    });
  });
  visit(tree, "html", () => {
    throw new Error(`${file}: use standard Markdown instead of HTML or Vue`);
  });
  if (/^\s*:::/m.test(content))
    throw new Error(
      `${file}: custom Markdown containers are not shared syntax`,
    );
  if (
    headings.filter((heading) => heading.depth === 1).length !== 1 ||
    headings[0]?.depth !== 1
  )
    throw new Error(`${file}: exactly one leading H1 is required`);
  if (headings[0].text !== data.title)
    throw new Error(`${file}: H1 must match title`);
  const future = data.since
    .split(".")
    .map(Number)
    .some((part, index, parts) => {
      const current = version
        .replace(/[-+].*$/, "")
        .split(".")
        .map(Number);
      return (
        parts.slice(0, index).every((n, i) => n === current[i]) &&
        part > current[index]
      );
    });
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    since: data.since,
    reviewed: data.reviewed ?? null,
    tags,
    related,
    aliases,
    locale,
    content,
    headings,
    searchText: textOf(tree),
    links: {},
    path,
    file,
    tree,
    draft: data.draft === true,
    future,
  };
}
export function readNavigation(source) {
  const data = parse(readFileSync(join(source, "navigation.yml"), "utf8"));
  if (!data || !Array.isArray(data.categories) || !data.categories.length)
    throw new Error("navigation: categories must be a nonempty list");
  const ids = new Set();
  const articles = new Set();
  const categories = data.categories.map((category) => {
    if (!category || !validId.test(category.id) || ids.has(category.id))
      throw new Error("navigation: category ids must be unique and valid");
    ids.add(category.id);
    const entries = strings(category.articles, "articles", "navigation");
    for (const id of entries) {
      if (!validId.test(id) || articles.has(id))
        throw new Error(`navigation: article ${id} must occur exactly once`);
      articles.add(id);
    }
    const titles = Object.fromEntries(
      locales.map((locale) => [
        locale,
        category.titles?.[locale] ?? category.id,
      ]),
    );
    if (
      Object.values(titles).some(
        (value) => typeof value !== "string" || !value.trim(),
      )
    )
      throw new Error(`navigation: invalid category titles for ${category.id}`);
    return { id: category.id, titles, articles: entries };
  });
  const featured = strings(data.featured, "featured", "navigation");
  if (featured.some((id) => !articles.has(id)))
    throw new Error("navigation: featured articles must be in categories");
  return { categories, featured };
}
