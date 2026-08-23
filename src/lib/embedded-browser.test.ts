import { describe, expect, it } from "vitest";

import { normalizeEmbeddedBrowserUrl } from "./embedded-browser";

describe("Embedded browser URL normalization", () => {
  it("adds https to a host entered without a scheme", () => {
    expect(normalizeEmbeddedBrowserUrl("skills.sh")).toBe("https://skills.sh/");
  });

  it("keeps complete web URLs", () => {
    expect(
      normalizeEmbeddedBrowserUrl("https://github.com/topics/agent-skills"),
    ).toBe("https://github.com/topics/agent-skills");
  });

  it("rejects non-web protocols", () => {
    expect(() => normalizeEmbeddedBrowserUrl("file:///tmp/skills")).toThrow(
      "http 或 https",
    );
  });
});
