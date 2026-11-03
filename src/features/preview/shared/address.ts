export type SearchEngine = "bing" | "google" | "duckduckgo";
export function resolveAddress(input: string, engine: SearchEngine): string {
  const value = input.trim();
  if (!value) throw new Error("PREVIEW_INVALID_ADDRESS");
  if (value === "about:blank") return value;
  if (/^(?:file|data|javascript|vbscript|about):/i.test(value))
    throw new Error("PREVIEW_INVALID_ADDRESS");
  if (/^https?:\/\//i.test(value)) return new URL(value).href;
  const local =
    /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(
      value,
    );
  if (
    !value.startsWith("?") &&
    !/\s/.test(value) &&
    (local || /^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value))
  ) {
    return new URL(`${local ? "http" : "https"}://${value}`).href;
  }
  const query = encodeURIComponent(value.replace(/^\?\s*/, ""));
  return engine === "duckduckgo"
    ? `https://duckduckgo.com/?q=${query}`
    : `https://www.${engine === "google" ? "google" : "bing"}.com/search?q=${query}`;
}
