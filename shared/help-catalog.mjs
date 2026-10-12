/** Article identity and language fallback are shared by the app and website build. */
export function findHelpArticle(articles, id, locale, defaultLocale = "zh") {
  const canonical = articles.find(
    (article) => article.id === id || article.aliases.includes(id),
  );
  if (!canonical) return undefined;
  return (
    articles.find(
      (article) => article.id === canonical.id && article.locale === locale,
    ) ??
    articles.find(
      (article) =>
        article.id === canonical.id && article.locale === defaultLocale,
    )
  );
}
