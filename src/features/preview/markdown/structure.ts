import GithubSlugger from "github-slugger";
import { unified } from "unified";
import remarkParse from "remark-parse";
interface Node {
  type: string;
  tagName?: string;
  value?: string;
  children?: Node[];
  depth?: number;
  position?: { start: { line: number } };
  properties?: Record<string, unknown>;
}
const text = (node: Node): string =>
  node.value ?? node.children?.map(text).join("") ?? "";
export function outline(content: string) {
  const root = unified().use(remarkParse).parse(content);
  const slugger = new GithubSlugger();
  const headings: { title: string; id: string; depth: number }[] = [];
  const walk = (node: Node) => {
    if (node.type === "heading")
      headings.push({
        title: text(node),
        id: slugger.slug(text(node)),
        depth: node.depth ?? 1,
      });
    node.children?.forEach(walk);
  };
  walk(root);
  return headings;
}
/** Keep source positions and anchors on the shared Markdown renderer's nodes. */
export function sourcePositions() {
  return (root: Node) => {
    const slugger = new GithubSlugger();
    const walk = (node: Node) => {
      if (
        node.type === "element" &&
        node.tagName &&
        /^(h[1-6]|p|li|pre|table|blockquote|img|hr)$/.test(node.tagName)
      ) {
        node.properties ??= {};
        node.properties["data-source-line"] = node.position?.start.line;
        if (/^h[1-6]$/.test(node.tagName))
          node.properties.id = slugger.slug(text(node));
      }
      node.children?.forEach(walk);
    };
    walk(root);
  };
}
export function documentResource(
  value: string | undefined,
  base: string | undefined,
) {
  if (!value || !base) return undefined;
  try {
    const original = new URL(base);
    // Markdown resources retain their authorization prefix for root-relative paths.
    const prefix =
      original.hostname === "127.0.0.1"
        ? original.pathname.split("/")[1]
        : undefined;
    const url = new URL(
      value.startsWith("/") && !value.startsWith("//") && prefix
        ? `/${prefix}${value}`
        : value,
      base,
    );
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
