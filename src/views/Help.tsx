import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { HelpArticle } from "../components/help/HelpArticle";
import { HelpNavigation } from "../components/help/HelpNavigation";
import { HelpHome, HelpSearchResults } from "../components/help/HelpListings";
import { getHelpArticle, helpCatalog, helpLocale } from "../lib/help/catalog";
import { FEEDBACK_URL } from "../lib/distribution";

export function Help() {
  const { t, i18n } = useTranslation();
  const locale = helpLocale(i18n.resolvedLanguage ?? i18n.language);
  const { articleId } = useParams();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const selectedCategory = params.get("category") ?? "";
  const [navigationOpen, setNavigationOpen] = useState(false);
  const linkedLocale = params.get("lang");
  const articleLocale =
    linkedLocale === "en" || linkedLocale === "zh" || linkedLocale === "zh-TW"
      ? linkedLocale
      : locale;
  const article = articleId
    ? getHelpArticle(articleId, articleLocale)
    : undefined;
  const searching = query.trim().length > 0;
  const category = helpCatalog.navigation.categories.find(
    (item) => item.id === article?.category,
  );
  return (
    <div className="app-page">
      <header className="app-page-header">
        <p className="text-[12px] font-semibold text-faint">
          {t("help.eyebrow")}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="app-page-title">{t("help.pageTitle")}</h1>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() =>
              openUrl(`${helpCatalog.siteUrl}${locale}/`).catch(() =>
                toast.error(t("help.openFailed")),
              )
            }
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("help.onlineDocs")}
          </button>
        </div>
        <p className="app-page-subtitle">{t("help.pageDescription")}</p>
        <p className="mt-1 text-[12px] text-muted">
          {t("help.version", { version: helpCatalog.version })} ·{" "}
          {t("help.offlineAvailable")}
        </p>
      </header>
      <form
        role="search"
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-accent-border"
        onSubmit={(event) => event.preventDefault()}
      >
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          aria-label={t("help.searchLabel")}
          value={query}
          placeholder={t("help.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-muted"
          onChange={(event) =>
            setParams(
              event.target.value
                ? {
                    q: event.target.value,
                    ...(selectedCategory ? { category: selectedCategory } : {}),
                  }
                : selectedCategory
                  ? { category: selectedCategory }
                  : {},
              { replace: true },
            )
          }
        />
        {query && (
          <button
            type="button"
            className="text-[12px] text-muted hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() =>
              setParams(
                selectedCategory ? { category: selectedCategory } : {},
                { replace: true },
              )
            }
          >
            {t("help.clearSearch")}
          </button>
        )}
      </form>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="self-start rounded-xl border border-border-subtle bg-surface p-3">
          <button
            type="button"
            aria-expanded={navigationOpen}
            aria-controls="help-navigation"
            className="flex w-full items-center gap-2 text-[13px] font-semibold text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:hidden"
            onClick={() => setNavigationOpen(!navigationOpen)}
          >
            <BookOpen className="h-4 w-4" />
            {t("help.categoriesLabel")}
          </button>
          <div
            id="help-navigation"
            className={`${navigationOpen ? "mt-3 block" : "hidden"} lg:mt-0 lg:block`}
          >
            <HelpNavigation
              locale={locale}
              articleId={article?.id}
              categoryId={article?.category ?? selectedCategory}
            />
          </div>
        </aside>
        <main className="min-w-0 rounded-xl border border-border-subtle bg-surface p-4 sm:p-5">
          {searching || (!articleId && selectedCategory) ? (
            <HelpSearchResults locale={locale} />
          ) : article ? (
            <>
              <nav
                aria-label={t("help.breadcrumb")}
                className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-muted"
              >
                <Link
                  className="hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  to="/help"
                >
                  {t("help.pageTitle")}
                </Link>
                <span>/</span>
                <Link
                  className="hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  to={`/help?category=${article.category}`}
                >
                  {category?.titles[locale]}
                </Link>
                <span>/</span>
                <span aria-current="page">{article.title}</span>
              </nav>
              <HelpArticle key={article.id} article={article} locale={locale} />
            </>
          ) : articleId ? (
            <div role="status" className="py-10 text-center">
              <h2 className="text-[16px] font-semibold text-primary">
                {t("help.articleNotFound")}
              </h2>
              <Link
                className="mt-3 inline-block text-[13px] text-accent-light underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                to="/help"
              >
                {t("help.allArticles")}
              </Link>
            </div>
          ) : (
            <HelpHome locale={locale} />
          )}
        </main>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span>{t("help.feedbackDescription")}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() =>
            openUrl(FEEDBACK_URL).catch(() => toast.error(t("help.openFailed")))
          }
        >
          {t("help.reportIssue")}
          <ExternalLink className="h-3 w-3" />
        </button>
      </footer>
    </div>
  );
}
