interface ArticleIdentity {
  id: string;
  locale: string;
  aliases: readonly string[];
}
export function findHelpArticle<T extends ArticleIdentity>(
  articles: readonly T[],
  id: string,
  locale: string,
  defaultLocale?: string,
): T | undefined;
