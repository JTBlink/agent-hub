import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CircleHelp,
  Library,
  ListChecks,
  RefreshCw,
  Rocket,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { getHelpArticle, helpCatalog } from "../../lib/help/catalog";
import type { HelpLocale } from "../../lib/help/types";

const categoryIcons: Record<string, LucideIcon> = {
  "getting-started": Rocket,
  recommendations: Sparkles,
  guides: BookOpen,
  troubleshooting: CircleHelp,
  reference: ListChecks,
  migrations: RefreshCw,
};

export function HelpNavigation({
  locale,
  articleId,
  categoryId,
}: {
  locale: HelpLocale;
  articleId?: string;
  categoryId?: string;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("help.categoriesLabel")} className="space-y-3">
      <Link
        aria-current={!articleId && !categoryId ? "page" : undefined}
        className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-semibold text-secondary hover:bg-surface-hover hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        to="/help"
      >
        <Library aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t("help.allArticles")}
      </Link>
      {helpCatalog.navigation.categories.map((category) => {
        const Icon = categoryIcons[category.id] ?? BookOpen;
        return (
          <section
            key={category.id}
            aria-labelledby={`help-category-${category.id}`}
            className="border-t border-border-subtle pt-3"
          >
            <h2 id={`help-category-${category.id}`}>
              <Link
                to={`/help?category=${category.id}`}
                aria-current={
                  !articleId && categoryId === category.id ? "page" : undefined
                }
                className="flex items-center gap-2 rounded-lg bg-bg-secondary px-2 py-2 text-[13px] font-semibold text-secondary hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Icon
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 ${categoryId === category.id ? "text-accent-light" : "text-tertiary"}`}
                />
                <span>{category.titles[locale]}</span>
              </Link>
            </h2>
            <div className="ml-4 mt-2 space-y-0.5 border-l border-border pl-2">
              {category.articles.map((id) => {
                const article = getHelpArticle(id, locale);
                return (
                  article && (
                    <Link
                      key={id}
                      to={`/help/${id}`}
                      aria-current={articleId === id ? "page" : undefined}
                      className={`block rounded-r-lg border-l-2 px-2 py-1.5 text-[12px] leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${articleId === id ? "border-accent bg-surface-active font-medium text-accent-light" : "border-transparent text-tertiary hover:bg-surface-hover hover:text-secondary"}`}
                    >
                      {article.title}
                    </Link>
                  )
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
