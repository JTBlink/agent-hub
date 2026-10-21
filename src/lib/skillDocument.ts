import { parse, stringify } from "yaml";

export interface SkillDocumentField {
  key: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep every frontmatter field; malformed metadata remains available verbatim. */
export function parseSkillDocument(content: string): {
  body: string;
  fields: SkillDocumentField[];
  rawMetadata?: string;
} {
  const match =
    /^\uFEFF?---[^\S\r\n]*\r?\n([\s\S]*?)^---[^\S\r\n]*(?:\r?\n|$)/m.exec(
      content,
    );
  if (!match || match.index !== 0) return { body: content, fields: [] };
  const body = content.slice(match[0].length).trimStart();
  const rawMetadata = match[1].trim();
  try {
    const metadata: unknown = parse(rawMetadata, { maxAliasCount: 0 });
    if (!isRecord(metadata)) return { body, fields: [], rawMetadata };
    const fields = Object.entries(metadata).flatMap(([key, value]) => {
      const entries =
        key === "metadata" && isRecord(value) && Object.keys(value).length > 0
          ? Object.entries(value).map(
              ([nestedKey, nestedValue]) =>
                [`metadata.${nestedKey}`, nestedValue] as const,
            )
          : [[key, value] as const];
      return entries.map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : stringify(value).trimEnd(),
      }));
    });
    return { body, fields };
  } catch {
    return { body, fields: [], rawMetadata };
  }
}
