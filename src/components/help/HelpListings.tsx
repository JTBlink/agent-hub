import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getHelpArticle,
  helpCatalog,
  searchHelp,
} from "../../lib/help/catalog";
import type { HelpArticle as Article, HelpLocale } from "../../lib/help/types";

function HelpArticleCard({ article }: { article: Article }) {
  return (
    <Link
      to={`/help/${article.id}`}
      className="block rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-accent-border hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <h3 className="text-[13px] font-semibold text-secondary">
        {article.title}
      </h3>
      <p className="mt-1 text-[12px] leading-5 text-muted">
        {article.description}
      </p>
    </Link>
  );
}

export function HelpSearchResults({ locale }: { locale: HelpLocale }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const searching = query.trim().length > 0;
  const results = searchHelp(query, locale).filter(
    (article) => !category || article.category === category,
  );
  return (
    <>
      <h2 className="text-[16px] font-semibold text-primary">
        {searching
          ? t("help.searchResults", { count: results.length })
          : helpCatalog.navigation.categories.find(
              (item) => item.id === category,
            )?.titles[locale]}
      </h2>
      <label className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        {t("help.filterCategory")}
        <select
          aria-label={t("help.filterCategory")}
          className="rounded-lg border border-border bg-background px-2 py-1 text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          value={category}
          onChange={(event) =>
            setParams(
              {
                ...(query ? { q: query } : {}),
                ...(event.target.value ? { category: event.target.value } : {}),
              },
              { replace: true },
            )
          }
        >
          <option value="">{t("help.allCategories")}</option>
          {helpCatalog.navigation.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.titles[locale]}
            </option>
          ))}
        </select>
      </label>
      {results.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {results.map((item) => (
            <HelpArticleCard key={item.id} article={item} />
          ))}
        </div>
      ) : (
        <div role="status" className="py-10 text-center">
          <p className="text-[13px] text-muted">{t("help.noResults")}</p>
          <button
            type="button"
            className="mt-3 text-[13px] text-accent-light underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => setParams({})}
          >
            {t("help.resetFilters")}
          </button>
        </div>
      )}
    </>
  );
}

export function HelpHome({ locale }: { locale: HelpLocale }) {
  const { t } = useTranslation();
  return (
    <>
      <h2 className="text-[16px] font-semibold text-primary">
        {t("help.recommendedArticles")}
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {helpCatalog.navigation.featured.map((id) => {
          const item = getHelpArticle(id, locale);
          return item ? <HelpArticleCard key={id} article={item} /> : null;
        })}
      </div>
      <h2 className="mb-3 mt-6 text-[16px] font-semibold text-primary">
        {t("help.browseCategories")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {helpCatalog.navigation.categories.map((item) => (
          <Link
            key={item.id}
            to={`/help?category=${item.id}`}
            className="rounded-xl border border-border-subtle p-4 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <h3 className="text-[13px] font-semibold text-secondary">
              {item.titles[locale]}
            </h3>
            <p className="mt-1 text-[12px] text-muted">
              {t("help.articleCount", { count: item.articles.length })}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
