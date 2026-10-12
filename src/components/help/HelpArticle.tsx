import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import type { HelpArticle as Article, HelpLocale } from "../../lib/help/types";
import {
  getHelpArticle,
  decodeHelpHash,
  helpArticleUrl,
  helpCatalog,
} from "../../lib/help/catalog";
import { HelpMarkdown } from "./HelpMarkdown";

export function HelpArticle({
  article,
  locale,
}: {
  article: Article;
  locale: HelpLocale;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const focusTarget = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    if (location.hash) {
      const heading = document.getElementById(decodeHelpHash(location.hash));
      heading?.scrollIntoView?.({ block: "start" });
      heading?.focus();
    } else {
      focusTarget.current?.focus({ preventScroll: true });
      focusTarget.current?.scrollIntoView?.({ block: "start" });
    }
  }, [article.id, location.hash]);

  const related = article.related.flatMap((id) => {
    const item = getHelpArticle(id, locale);
    return item ? [item] : [];
  });
  const toc = article.headings.filter(
    (heading) => heading.depth > 1 && heading.depth <= 3,
  );
  const shareUrl = helpArticleUrl(
    article.id,
    article.locale,
    decodeHelpHash(location.hash),
  );
  return (
    <div ref={focusTarget} tabIndex={-1} className="min-w-0 outline-none">
      <div className="border-b border-border-subtle pb-4">
        <h1
          id={article.headings[0]?.id}
          tabIndex={-1}
          className="scroll-mt-6 text-[23px] font-semibold text-primary"
        >
          {article.title}
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-tertiary">
          {article.description}
        </p>
        <p className="mt-2 text-[12px] text-muted">
          {t("help.version", { version: helpCatalog.version })} ·{" "}
          {t("help.since", { version: article.since })}
          {article.reviewed
            ? ` · ${t("help.reviewed", { date: article.reviewed })}`
            : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() =>
              openUrl(shareUrl).catch(() => toast.error(t("help.openFailed")))
            }
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("help.openOnline")}
          </button>
          <button
            type="button"
            disabled={copying}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-secondary hover:bg-surface-hover disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={async () => {
              if (copying) return;
              setCopying(true);
              try {
                await writeText(shareUrl);
                toast.success(t("help.linkCopied"));
              } catch {
                toast.error(t("help.copyFailed"));
              } finally {
                setCopying(false);
              }
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            {t("help.copyLink")}
          </button>
        </div>
      </div>
      {article.locale !== locale && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-accent-border bg-accent/10 p-3 text-[13px] text-secondary"
        >
          {t("help.translationFallback")}
        </p>
      )}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_150px]">
        {toc.length > 0 && (
          <nav
            aria-label={t("help.onThisPage")}
            className="order-first mt-5 text-[12px] xl:order-last"
          >
            <details open className="xl:sticky xl:top-4">
              <summary className="cursor-pointer font-semibold text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                {t("help.onThisPage")}
              </summary>
              <div className="mt-2 space-y-2 border-l border-border-subtle pl-3">
                {toc.map((heading) => (
                  <Link
                    key={heading.id}
                    className={`block text-muted hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${heading.depth === 3 ? "pl-2" : ""}`}
                    to={`/help/${article.id}?lang=${article.locale}#${encodeURIComponent(heading.id)}`}
                  >
                    {heading.text}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
        )}
        <div className="min-w-0">
          <HelpMarkdown article={article} />
          {related.length > 0 && (
            <nav
              aria-label={t("help.related")}
              className="mt-6 border-t border-border-subtle pt-4"
            >
              <h2 className="text-[14px] font-semibold text-primary">
                {t("help.related")}
              </h2>
              <div className="mt-2 flex flex-wrap gap-3">
                {related.map((item) => (
                  <Link
                    key={item.id}
                    className="text-[13px] text-accent-light underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    to={`/help/${item.id}`}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
