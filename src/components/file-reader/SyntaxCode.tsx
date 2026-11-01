import { useEffect, useState, type ReactNode } from "react";
import { highlightTree } from "@lezer/highlight";
import { languageForPath } from "./codeLanguages";
import { codeHighlightStyle } from "./codeTheme";

/** Markdown and the editor share the same parsers and theme. */
export function SyntaxCode({
  content,
  language,
  className,
}: {
  content: string;
  language: string;
  className?: string;
}) {
  const [highlight, setHighlight] = useState<{
    content: string;
    language: string;
    nodes: ReactNode[];
  }>();
  useEffect(() => {
    let disposed = false;
    const description =
      content.length <= 200_000 ? languageForPath(`snippet.${language}`) : null;
    if (description)
      void description
        .load()
        .then((support) => {
          if (disposed) return;
          const nodes: ReactNode[] = [];
          let position = 0;
          highlightTree(
            support.language.parser.parse(content),
            codeHighlightStyle,
            (from, to, classes) => {
              if (from > position) nodes.push(content.slice(position, from));
              nodes.push(
                <span key={from} className={classes}>
                  {content.slice(from, to)}
                </span>,
              );
              position = to;
            },
          );
          if (position < content.length) nodes.push(content.slice(position));
          if (!document.getElementById("agenthub-code-highlight")) {
            const style = document.createElement("style");
            style.id = "agenthub-code-highlight";
            style.textContent = codeHighlightStyle.module?.getRules() ?? "";
            document.head.append(style);
          }
          setHighlight({ content, language, nodes });
        })
        .catch(() => {
          /* Plain code remains readable. */
        });
    return () => {
      disposed = true;
    };
  }, [content, language]);
  return (
    <code className={className}>
      {highlight?.content === content && highlight.language === language
        ? highlight.nodes
        : content}
    </code>
  );
}
