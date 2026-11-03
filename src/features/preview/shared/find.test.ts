// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { findInDocument } from "./find";
it("cycles matching text across headings, code tokens, table cells and list items", () => {
  const root = document.createElement("div");
  root.innerHTML =
    "<h4>match</h4><pre><span>ma</span><span>tch</span></pre><table><tbody><tr><td>match</td></tr></tbody></table><ul><li>match</li></ul>";
  document.body.append(root);
  Element.prototype.scrollIntoView = vi.fn();
  expect(findInDocument(root, "match", -1, false)).toEqual({
    count: 4,
    index: 0,
  });
  expect(findInDocument(root, "match", 0, false)).toEqual({
    count: 4,
    index: 1,
  });
  expect(document.getSelection()?.toString()).toBe("match");
  expect(findInDocument(root, "match", 0, true)).toEqual({
    count: 4,
    index: 3,
  });
  root.remove();
});
