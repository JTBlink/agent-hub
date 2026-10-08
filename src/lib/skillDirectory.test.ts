import { describe, expect, it } from "vitest";
import { vscodeDirectoryUrl } from "./skillDirectory";

describe("VS Code folder links", () => {
  it("preserves spaces, Unicode and URI punctuation in a local folder", () => {
    expect(vscodeDirectoryUrl("/workspace/.agents/skills/a #?中文")).toBe(
      "vscode://file/workspace/.agents/skills/a%20%23%3F%E4%B8%AD%E6%96%87",
    );
  });
  it("handles Windows drive and UNC paths", () => {
    expect(vscodeDirectoryUrl(String.raw`D:\skills\demo`)).toBe(
      "vscode://file/D%3A/skills/demo",
    );
    expect(vscodeDirectoryUrl(String.raw`\\server\share\demo`)).toBe(
      "vscode://file//server/share/demo",
    );
  });
  it("refuses relative paths and URL schemes", () => {
    for (const path of ["", "~/skills", "https://example.invalid", "demo"]) {
      expect(() => vscodeDirectoryUrl(path)).toThrow();
    }
  });
  it("opens canonical Windows paths returned by the backend", () => {
    expect(vscodeDirectoryUrl(String.raw`\\?\D:\skills\demo`)).toBe(
      vscodeDirectoryUrl(String.raw`D:\skills\demo`),
    );
    expect(vscodeDirectoryUrl(String.raw`\\?\UNC\server\share\demo`)).toBe(
      vscodeDirectoryUrl(String.raw`\\server\share\demo`),
    );
  });
});
