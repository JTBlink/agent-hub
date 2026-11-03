import { MarkdownContent } from "../../../components/MarkdownContent";

/** Keep source positions from the shared Markdown parser for block annotations. */
export function PrototypeMarkdown({ content }: { content: string }) {
  return (
    <MarkdownContent
      content={content}
      components={{
        h1: ({ node, ...props }) => (
          <h1
            className="mb-4 text-3xl font-semibold text-primary"
            data-source-line={node?.position?.start.line}
            {...props}
          />
        ),
        h2: ({ node, ...props }) => (
          <h2
            className="mb-3 mt-8 text-2xl font-semibold text-primary"
            data-source-line={node?.position?.start.line}
            {...props}
          />
        ),
        h3: ({ node, ...props }) => (
          <h3
            className="mb-2 mt-6 text-lg font-semibold text-primary"
            data-source-line={node?.position?.start.line}
            {...props}
          />
        ),
        p: ({ node, ...props }) => (
          <p
            className="mb-4 leading-6"
            data-source-line={node?.position?.start.line}
            {...props}
          />
        ),
        li: ({ node, ...props }) => (
          <li data-source-line={node?.position?.start.line} {...props} />
        ),
        img: ({ alt }) => (
          <span className="pv-subtle">
            [图片：{alt || "未命名"} · 原型未加载]
          </span>
        ),
        a: ({ children }) => <span className="pv-inline-link">{children}</span>,
      }}
    />
  );
}
