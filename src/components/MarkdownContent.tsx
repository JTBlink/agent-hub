import { MarkdownLink } from "./MarkdownLink";
import ReactMarkdown, { type Components } from "react-markdown";
import type { ReactNode } from "react";
import type { PluggableList } from "unified";
import remarkGfm from "remark-gfm";
import { cn } from "../utils";
import { SyntaxCode } from "./file-reader/SyntaxCode";

interface MarkdownContentProps {
  content: string;
  className?: string;
  components?: Components;
  children?: ReactNode;
  rehypePlugins?: PluggableList;
}

export function MarkdownContent({
  content,
  className,
  components,
  children,
  rehypePlugins,
}: MarkdownContentProps) {
  return (
    <article
      className={cn(
        "mx-auto w-full max-w-[1240px] text-sm leading-6 text-secondary",
        className,
      )}
    >
      {children}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          h1: ({ className, ...props }) => (
            <h1
              className={cn(
                "mb-4 text-3xl font-semibold leading-tight text-primary",
                className,
              )}
              {...props}
            />
          ),
          h2: ({ className, ...props }) => (
            <h2
              className={cn(
                "mb-3 mt-8 text-2xl font-semibold leading-tight text-primary",
                className,
              )}
              {...props}
            />
          ),
          h3: ({ className, ...props }) => (
            <h3
              className={cn(
                "mb-2 mt-6 text-lg font-semibold leading-tight text-primary",
                className,
              )}
              {...props}
            />
          ),
          p: ({ className, ...props }) => (
            <p
              className={cn("mb-4 text-sm leading-6 text-secondary", className)}
              {...props}
            />
          ),
          a: ({ className, href, title, children }) => (
            <MarkdownLink className={className} href={href} title={title}>
              {children}
            </MarkdownLink>
          ),
          ul: ({ className, ...props }) => (
            <ul
              className={cn(
                "mb-4 list-disc space-y-1 pl-5 text-secondary",
                className,
              )}
              {...props}
            />
          ),
          ol: ({ className, ...props }) => (
            <ol
              className={cn(
                "mb-4 list-decimal space-y-1 pl-5 text-secondary",
                className,
              )}
              {...props}
            />
          ),
          li: ({ className, ...props }) => (
            <li
              className={cn("pl-1 marker:text-muted", className)}
              {...props}
            />
          ),
          blockquote: ({ className, ...props }) => (
            <blockquote
              className={cn(
                "mb-4 border-l-2 border-accent-border bg-surface/70 px-4 py-2 text-tertiary italic",
                className,
              )}
              {...props}
            />
          ),
          hr: ({ className, ...props }) => (
            <hr
              className={cn("my-6 border-border-subtle", className)}
              {...props}
            />
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = String(className || "").includes("language-");
            if (isBlock) {
              return (
                <SyntaxCode
                  className={cn(
                    "block font-mono text-code leading-6 text-secondary",
                    className,
                  )}
                  content={String(children ?? "")}
                  language={
                    /language-([^\s]+)/.exec(className ?? "")?.[1] ?? ""
                  }
                />
              );
            }

            return (
              <code
                className={cn(
                  "rounded bg-surface-hover px-1.5 py-0.5 font-mono text-sm text-accent-light",
                  className,
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ className, ...props }) => (
            <pre
              className={cn(
                "mb-4 overflow-x-auto rounded-xl border border-border-subtle bg-background px-4 py-3",
                className,
              )}
              {...props}
            />
          ),
          table: ({ className, ...props }) => (
            <div className="mb-4 overflow-x-auto rounded-xl border border-border-subtle">
              <table
                className={cn(
                  "min-w-full border-collapse text-left text-sm",
                  className,
                )}
                {...props}
              />
            </div>
          ),
          thead: ({ className, ...props }) => (
            <thead
              className={cn("bg-surface-hover text-primary", className)}
              {...props}
            />
          ),
          th: ({ className, ...props }) => (
            <th
              className={cn(
                "border-b border-border-subtle px-3 py-2 font-medium",
                className,
              )}
              {...props}
            />
          ),
          td: ({ className, ...props }) => (
            <td
              className={cn(
                "border-b border-border-subtle px-3 py-2 text-secondary",
                className,
              )}
              {...props}
            />
          ),
          ...components,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
