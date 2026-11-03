import { expect, it } from "vitest";
import { relativeDirectoryPath } from "./directoryPath";

it.each([
  ["/projects/demo", "/projects/demo/", "."],
  ["/projects/demo", "/projects/demo/.worktrees/topic", ".worktrees/topic"],
  ["/projects/demo", "/projects/topic", "../topic"],
  ["/projects/demo", "/projects/demo-other", "../demo-other"],
  ["/projects/demo/./", "/projects/demo/tmp/../主题", "主题"],
  ["/", "/projects/demo", "projects/demo"],
  ["C:\\Projects\\Demo", "c:/projects/demo/topic", "topic"],
  ["C:\\projects\\demo", "C:\\projects\\topic", "..\\topic"],
  ["\\\\server\\share\\demo", "\\\\server\\share\\topic", "..\\topic"],
  ["C:/demo", "D:/topic", null],
  ["//server/share/demo", "//server/other/topic", null],
  ["/projects/demo", "relative/topic", null],
  [null, "/projects/demo", null],
  ["/projects/demo", null, null],
])("computes a relative directory from %s to %s", (base, path, expected) => {
  expect(relativeDirectoryPath(base, path)).toBe(expected);
});
