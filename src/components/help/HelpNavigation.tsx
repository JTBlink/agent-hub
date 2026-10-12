import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getHelpArticle, helpCatalog } from "../../lib/help/catalog";
import type { HelpLocale } from "../../lib/help/types";

export function HelpNavigation({
  locale,
  articleId,
}: {
  locale: HelpLocale;
  articleId?: string;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("help.categoriesLabel")} className="space-y-4">
      <Link
        className="block text-[13px] font-semibold text-secondary hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        to="/help"
      >
        {t("help.allArticles")}
      </Link>
      {helpCatalog.navigation.categories.map((category) => (
        <div key={category.id}>
          <h2 className="mb-1 px-2 text-[12px] font-semibold text-tertiary">
            {category.titles[locale]}
          </h2>
          {category.articles.map((id) => {
            const article = getHelpArticle(id, locale);
            return (
              article && (
                <Link
                  key={id}
                  to={`/help/${id}`}
                  aria-current={articleId === id ? "page" : undefined}
                  className={`block rounded-lg px-2 py-1.5 text-[12px] leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${articleId === id ? "bg-surface-active text-accent-light" : "text-muted hover:bg-surface-hover hover:text-secondary"}`}
                >
                  {article.title}
                </Link>
              )
            );
          })}
        </div>
      ))}
    </nav>
  );
}
