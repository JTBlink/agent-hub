import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { visit } from "unist-util-visit";

function inDirectory(directory, path) {
  const part = relative(directory, path);
  return (
    part &&
    part !== ".." &&
    !part.startsWith(`..${sep}`) &&
    !part.startsWith(sep)
  );
}
export function resolveArticleLinks(article, byPath, source) {
  const assets = new Set();
  const replacements = [];
  function resolveLink(url, image) {
    if (/^https:\/\//i.test(url)) {
      if (image)
        throw new Error(
          `${article.file}: images must be local for offline reading`,
        );
      return { kind: "external", url };
    }
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url) || url.startsWith("/"))
      throw new Error(`${article.file}: unsupported link ${url}`);
    const [pathname, hash = ""] = url.split("#");
    const path = pathname
      ? resolve(dirname(article.path), decodeURIComponent(pathname))
      : article.path;
    if (image) {
      const assetRoot = resolve(source, "assets");
      if (
        !inDirectory(assetRoot, path) ||
        !existsSync(path) ||
        !statSync(path).isFile() ||
        !/\.(?:svg|png|jpe?g|webp|gif|avif)$/i.test(path) ||
        !inDirectory(realpathSync(assetRoot), realpathSync(path))
      )
        throw new Error(`${article.file}: missing or unsafe image ${url}`);
      assets.add(path);
      return {
        kind: "asset",
        path: relative(assetRoot, path).replaceAll("\\", "/"),
      };
    }
    const target = byPath.get(path);
    if (!target) throw new Error(`${article.file}: broken article link ${url}`);
    const anchor = decodeURIComponent(hash);
    if (anchor && !target.headings.some((heading) => heading.id === anchor))
      throw new Error(`${article.file}: missing section ${url}`);
    return {
      kind: "article",
      id: target.id,
      locale: target.locale,
      hash: anchor,
    };
  }
  const definitions = new Map();
  visit(article.tree, "definition", (node) =>
    definitions.set(node.identifier, node),
  );
  visit(article.tree, (node) => {
    const image = node.type === "image" || node.type === "imageReference";
    if (
      !["link", "image", "linkReference", "imageReference"].includes(node.type)
    )
      return;
    const definition = node.type.endsWith("Reference")
      ? definitions.get(node.identifier)
      : node;
    if (!definition)
      throw new Error(
        `${article.file}: undefined reference ${node.identifier}`,
      );
    const link = resolveLink(definition.url, image);
    if (
      article.links[definition.url] &&
      article.links[definition.url].kind !== link.kind
    )
      throw new Error(`${article.file}: link used as both image and article`);
    article.links[definition.url] = link;
    if (!replacements.some((item) => item.node === definition))
      replacements.push({ node: definition, link });
  });
  return { assets, replacements };
}
export function websiteContent(article, replacements) {
  let content = article.content;
  for (const { node, link } of replacements.sort(
    (a, b) => b.node.position.start.offset - a.node.position.start.offset,
  )) {
    if (link.kind === "external") continue;
    const url =
      link.kind === "asset"
        ? `../assets/${link.path}`
        : `../${link.locale}/${link.id}.md${link.hash ? `#${link.hash}` : ""}`;
    const start = node.position.start.offset;
    const end = node.position.end.offset;
    const original = content.slice(start, end);
    // A parsed node's source range confines URL replacement to this link, not prose/code.
    const escaped = node.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const replaced = original.replace(
      new RegExp(`([(<]|:\\s*<?)${escaped}(?=[)>\\s]|$)`),
      (_, prefix) => `${prefix}${url}`,
    );
    if (replaced === original && node.url !== url)
      throw new Error(
        `${article.file}: use an unescaped URL in Markdown links`,
      );
    content = content.slice(0, start) + replaced + content.slice(end);
  }
  return content;
}
