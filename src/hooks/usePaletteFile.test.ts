import { expect, it } from "vitest";
import { paletteFilePath } from "./usePaletteFile";

it.each([
  [" /tmp/my notes/guide.md ", "/tmp/my notes/guide.md"],
  ['"~/notes/guide.md"', "~/notes/guide.md"],
  ["'C:\\notes\\guide.md'", "C:\\notes\\guide.md"],
  ["\\\\server\\share\\guide.md", "\\\\server\\share\\guide.md"],
  ["notes/guide.md", null],
  ["https://example.invalid/guide.md", null],
  ["shared", null],
  ["", null],
])("recognizes explicit local file input %s", (query, expected) => {
  expect(paletteFilePath(query)).toBe(expected);
});

it.each([
  [".agents/skills/example/guide.md", ".agents/skills/example/guide.md"],
  ["./guide.md", "guide.md"],
  ["docs\\my notes\\guide.md", "docs/my notes/guide.md"],
  ["https://example.invalid/guide.md", null],
  ["guide.md", null],
])(
  "only interprets explicit checkout-relative paths (%s)",
  (input, expected) => {
    expect(paletteFilePath(input, true)).toBe(expected);
  },
);
