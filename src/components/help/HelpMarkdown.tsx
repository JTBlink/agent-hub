import { createElement } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import type { Components } from "react-markdown";
import type { HelpArticle } from "../../lib/help/types";
import { SkillMarkdown } from "../SkillMarkdown";

export function HelpMarkdown({ article }: { article: HelpArticle }) {
  const { t } = useTranslation();
  // ReactMarkdown encodes Unicode in URLs before passing them to renderers.
  const encodedLinks = Object.fromEntries(
    Object.entries(article.links).map(([href, link]) => [
      encodeURI(href),
      link,
    ]),
  );
  const components: Components = {
    h1: () => null,
    a: ({ href, children }) => {
      const link = href
        ? (article.links[href] ?? encodedLinks[href])
        : undefined;
      if (link?.kind === "article")
        return (
          <Link
            className="text-accent-light underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            to={`/help/${link.id}?lang=${link.locale}${link.hash ? `#${encodeURIComponent(link.hash)}` : ""}`}
          >
            {children}
          </Link>
        );
      if (link?.kind === "external")
        return (
          <a
            className="text-accent-light underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            href={link.url}
            onClick={(event) => {
              event.preventDefault();
              openUrl(link.url).catch(() => toast.error(t("help.openFailed")));
            }}
          >
            {children}
          </a>
        );
      return <span>{children}</span>;
    },
    img: ({ src, alt }) => {
      const link = src ? article.links[src] : undefined;
      return link?.kind === "asset" ? (
        <img
          className="my-4 h-auto max-w-full rounded-xl"
          src={`${import.meta.env.BASE_URL}help-assets/${link.path}`}
          alt={alt ?? ""}
          loading="lazy"
        />
      ) : null;
    },
  };
  // The build's heading ids also drive the website; use source lines, not render order.
  for (const tag of ["h2", "h3", "h4", "h5", "h6"] as const) {
    components[tag] = ({ node, children }) => {
      const heading = article.headings.find(
        (item) => item.line === node?.position?.start.line,
      );
      return createElement(
        tag,
        {
          id: heading?.id,
          tabIndex: -1,
          className: `scroll-mt-6 font-semibold text-primary ${"mb-3 mt-7 text-[17px]"}`,
        },
        children,
      );
    };
  }
  return <SkillMarkdown content={article.content} components={components} />;
}
