import { memo, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownContent } from "../../../components/MarkdownContent";
import { CodeEditor } from "../../../components/file-reader/CodeEditor";
import type { Annotation } from "../shared/session";
import type { PreviewDocument } from "../api";
import { documentResource, outline, sourcePositions } from "./structure";
const plugins = [sourcePositions];
const MarkdownBody = memo(function MarkdownBody({
  draft,
  base,
  onLink,
}: {
  draft: string;
  base?: string;
  onLink: (href: string) => void;
}) {
  const components = useMemo(
    () => ({
      a: ({
        href,
        children,
      }: {
        href?: string;
        children?: React.ReactNode;
      }) => (
        <a
          href={documentResource(href, base)}
          onClick={(event) => {
            event.preventDefault();
            if (href?.startsWith("#")) {
              try {
                event.currentTarget
                  .closest("article")
                  ?.querySelector(
                    `#${CSS.escape(decodeURIComponent(href.slice(1)))}`,
                  )
                  ?.scrollIntoView({ block: "start" });
              } catch {
                /* A malformed fragment is not a navigation instruction. */
              }
            } else if (href) onLink(href);
          }}
        >
          {children}
        </a>
      ),
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <img
          src={documentResource(src, base)}
          alt={alt ?? ""}
          crossOrigin="anonymous"
          loading="lazy"
        />
      ),
    }),
    [base, onLink],
  );
  return (
    <MarkdownContent
      content={draft}
      rehypePlugins={plugins}
      components={components}
    />
  );
});
export function MarkdownPreview({
  document,
  draft,
  onChange,
  source,
  sourceLine,
  picking,
  onCapture,
  onLink,
}: {
  document: PreviewDocument;
  draft: string;
  onChange?: (text: string) => void;
  source: boolean;
  sourceLine?: number;
  picking: boolean;
  onCapture: (
    value: Omit<Annotation, "id" | "tabId" | "revision" | "note">,
  ) => void;
  onLink: (address: string) => void;
}) {
  const { t } = useTranslation();
  const highlighted = useRef<HTMLElement | null>(null);
  const headings = useMemo(() => outline(draft), [draft]);
  if (source)
    return (
      <CodeEditor
        file={{ path: document.title, content: draft }}
        wrap
        onChange={onChange}
        location={
          sourceLine ? { line: sourceLine, column: 1, endColumn: 1 } : undefined
        }
        maxLength={1024 * 1024}
      />
    );
  return (
    <div className={`preview-markdown-layout ${picking ? "picking" : ""}`}>
      <div
        className="preview-markdown"
        onMouseMove={(event) => {
          if (!picking) return;
          const block = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-source-line]",
          );
          if (block === highlighted.current) return;
          highlighted.current?.removeAttribute("data-highlight");
          highlighted.current = block;
          block?.setAttribute("data-highlight", "true");
        }}
        onMouseLeave={() => {
          highlighted.current?.removeAttribute("data-highlight");
          highlighted.current = null;
        }}
        onClickCapture={(event) => {
          if (!picking) return;
          event.preventDefault();
          event.stopPropagation();
          const block = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-source-line]",
          );
          if (!block) return;
          const root = event.currentTarget;
          const box = block.getBoundingClientRect(),
            container = root.getBoundingClientRect();
          const scale = container.width / root.offsetWidth || 1;
          const domPath: string[] = [];
          for (
            let node: HTMLElement | null = block;
            node && node !== root && domPath.length < 32;
            node = node.parentElement
          ) {
            const index = node.parentElement
              ? Array.from(node.parentElement.children).indexOf(node) + 1
              : 1;
            domPath.unshift(
              `${node.tagName.toLowerCase()}:nth-child(${index})`,
            );
          }
          onCapture({
            selector: block.tagName.toLowerCase(),
            text: block.innerText.slice(0, 2000),
            html: block.outerHTML.slice(0, 4096),
            styles: Object.fromEntries(
              [
                "color",
                "background-color",
                "font-family",
                "font-size",
                "font-weight",
                "line-height",
                "padding",
                "margin",
                "display",
                "gap",
                "border-radius",
              ].map((key) => [
                key,
                getComputedStyle(block).getPropertyValue(key).slice(0, 500),
              ]),
            ),
            accessibility: {
              role:
                block.getAttribute("role") ??
                (/^H[1-6]$/.test(block.tagName)
                  ? "heading"
                  : block.tagName === "P"
                    ? "paragraph"
                    : null),
              label: block.getAttribute("aria-label"),
            },
            sourceLine: Number(block.dataset.sourceLine),
            sourceEndLine:
              Number(block.dataset.sourceEndLine) ||
              Number(block.dataset.sourceLine),
            domPath,
            viewport: {
              width: root.clientWidth,
              height: root.parentElement?.clientHeight ?? root.clientHeight,
              dpr: window.devicePixelRatio || 1,
              scrollX: root.parentElement?.scrollLeft ?? 0,
              scrollY: root.parentElement?.scrollTop ?? 0,
              scale,
            },
            bounds: {
              x: (box.left - container.left) / scale,
              y: (box.top - container.top) / scale,
              width: box.width / scale,
              height: box.height / scale,
            },
          });
          block.removeAttribute("data-highlight");
        }}
      >
        <MarkdownBody draft={draft} base={document.url} onLink={onLink} />
      </div>
      <nav className="preview-toc" aria-label={t("preview.contents")}>
        <strong>{t("preview.contents")}</strong>
        {headings.map((heading) => (
          <button
            key={heading.id}
            style={{ paddingInlineStart: Math.max(0, heading.depth - 1) * 8 }}
            onClick={(event) =>
              event.currentTarget
                .closest(".preview-markdown-layout")
                ?.querySelector(`#${CSS.escape(heading.id)}`)
                ?.scrollIntoView({ block: "start", behavior: "smooth" })
            }
          >
            {heading.title}
          </button>
        ))}
      </nav>
    </div>
  );
}
