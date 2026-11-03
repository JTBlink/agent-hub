import { describe, expect, it } from "vitest";
import { documentResource, outline } from "./structure";
describe("Markdown structure", () => {
  it("keeps real headings and duplicate anchors without treating code as headings", () => {
    expect(
      outline(
        "# Hello *world*\n\n```md\n## Not a heading\n```\n\n## Hello world",
      ),
    ).toEqual([
      { title: "Hello world", id: "hello-world", depth: 1 },
      { title: "Hello world", id: "hello-world-1", depth: 2 },
    ]);
  });
  it("keeps root-relative resources inside the authorized document", () => {
    expect(
      documentResource(
        "/assets/image.png",
        "http://127.0.0.1:1234/grant/docs/guide.md",
      ),
    ).toBe("http://127.0.0.1:1234/grant/assets/image.png");
    expect(
      documentResource("javascript:alert(1)", "http://localhost/"),
    ).toBeUndefined();
  });
});
