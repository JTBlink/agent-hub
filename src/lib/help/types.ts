export type HelpLocale = "zh" | "en" | "zh-TW";
export type HelpLink =
  | { kind: "article"; id: string; locale: HelpLocale; hash: string }
  | { kind: "asset"; path: string }
  | { kind: "external"; url: string };

export interface HelpHeading {
  id: string;
  text: string;
  depth: number;
  line: number;
}

export interface HelpArticle {
  id: string;
  locale: HelpLocale;
  category: string;
  title: string;
  description: string;
  since: string;
  reviewed: string | null;
  tags: string[];
  related: string[];
  aliases: string[];
  content: string;
  searchText: string;
  headings: HelpHeading[];
  links: Record<string, HelpLink>;
}

export interface HelpCategory {
  id: string;
  titles: Record<HelpLocale, string>;
  articles: string[];
}

export interface HelpCatalog {
  version: string;
  siteUrl: string;
  defaultLocale: HelpLocale;
  locales: HelpLocale[];
  navigation: { categories: HelpCategory[]; featured: string[] };
  articles: HelpArticle[];
}
