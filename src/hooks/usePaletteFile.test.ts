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
