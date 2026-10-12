import MiniSearch from "minisearch";
import helpCatalog from "../../generated/help/catalog";
import { tokenizeHelp } from "../../../shared/help-search.mjs";
import { findHelpArticle } from "../../../shared/help-catalog.mjs";
import type { HelpArticle, HelpLocale } from "./types";

export { helpCatalog };
export function helpLocale(language: string): HelpLocale {
  if (language === "zh-TW" || language === "zh-Hant") return "zh-TW";
  return language.startsWith("en") ? "en" : "zh";
}

export function getHelpArticle(
  id: string,
  locale: HelpLocale,
): HelpArticle | undefined {
  return findHelpArticle(
    helpCatalog.articles,
    id,
    locale,
    helpCatalog.defaultLocale,
  );
}

export function decodeHelpHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

export function getHelpArticles(locale: HelpLocale): HelpArticle[] {
  return helpCatalog.navigation.categories.flatMap((category) =>
    category.articles.flatMap((id) => {
      const article = getHelpArticle(id, locale);
      return article ? [article] : [];
    }),
  );
}

const indexes = new Map<HelpLocale, MiniSearch<HelpArticle>>();
export function searchHelp(query: string, locale: HelpLocale): HelpArticle[] {
  const articles = getHelpArticles(locale);
  if (!query.trim()) return articles;
  if (!tokenizeHelp(query).length) return [];
  let index = indexes.get(locale);
  if (!index) {
    index = new MiniSearch<HelpArticle>({
      fields: ["title", "description", "tags", "searchText"],
      tokenize: tokenizeHelp,
      extractField: (article, field) => {
        const fields: Record<string, string> = {
          id: article.id,
          title: article.title,
          description: article.description,
          tags: article.tags.join(" "),
          searchText: article.searchText,
        };
        return fields[field] ?? "";
      },
      searchOptions: {
        combineWith: "AND",
        prefix: true,
        boost: { title: 8, description: 4, tags: 4 },
      },
    });
    index.addAll(articles);
    indexes.set(locale, index);
  }
  return index.search(query).flatMap((result) => {
    const article = getHelpArticle(result.id, locale);
    return article ? [article] : [];
  });
}

export function helpArticleUrl(
  id: string,
  locale: HelpLocale,
  hash = "",
): string {
  const url = new URL(
    `${locale}/${encodeURIComponent(id)}.html`,
    helpCatalog.siteUrl,
  );
  if (hash) url.hash = hash;
  return url.href;
}
