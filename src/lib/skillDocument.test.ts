import { describe, expect, it } from "vitest";
import { parseSkillDocument } from "./skillDocument";

describe("parseSkillDocument", () => {
  it("retains summary, description, nested version and custom fields with the body", () => {
    const result = parseSkillDocument(`---
name: demo
summary: Short summary
description: |
  First line
  Last line
license: MIT
metadata:
  version: "2.1.0"
  category: engineering
allowed-tools: [Read, Write]
custom:
  enabled: false
---
# Instructions
`);
    expect(result.body).toBe("# Instructions\n");
    expect(result.fields).toEqual([
      { key: "name", value: "demo" },
      { key: "summary", value: "Short summary" },
      { key: "description", value: "First line\nLast line\n" },
      { key: "license", value: "MIT" },
      { key: "metadata.version", value: "2.1.0" },
      { key: "metadata.category", value: "engineering" },
      { key: "allowed-tools", value: "- Read\n- Write" },
      { key: "custom", value: "enabled: false" },
    ]);
  });

  it("handles BOM, CRLF, numeric versions and a closing delimiter at EOF", () => {
    expect(parseSkillDocument("\uFEFF---\r\nversion: 2\r\n---")).toEqual({
      body: "",
      fields: [{ key: "version", value: "2" }],
    });
  });

  it.each(["summary: [broken", "- non-mapping metadata", "value: *missing"])(
    "preserves unreadable metadata verbatim: %s",
    (rawMetadata) => {
      expect(parseSkillDocument(`---\n${rawMetadata}\n---\nBody`)).toEqual({
        body: "Body",
        fields: [],
        rawMetadata,
      });
    },
  );

  it.each([
    "# Body\n---\nsummary: content\n---\n",
    "---\nsummary: Unclosed",
    "Plain document",
  ])("keeps normal markdown and unclosed frontmatter intact", (body) =>
    expect(parseSkillDocument(body)).toEqual({ body, fields: [] }),
  );
});
