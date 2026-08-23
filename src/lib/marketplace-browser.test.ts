import { describe, expect, it } from "vitest";

import { normalizeMarketplaceBrowserUrl } from "./marketplace-browser";

describe("Marketplace browser URL normalization", () => {
  it("adds https to a host entered without a scheme", () => {
    expect(normalizeMarketplaceBrowserUrl("skills.sh")).toBe(
      "https://skills.sh/",
    );
  });

  it("keeps complete web URLs", () => {
    expect(
      normalizeMarketplaceBrowserUrl("https://github.com/topics/agent-skills"),
    ).toBe("https://github.com/topics/agent-skills");
  });

  it("rejects non-web protocols", () => {
    expect(() => normalizeMarketplaceBrowserUrl("file:///tmp/skills")).toThrow(
      "http 或 https",
    );
  });
});
