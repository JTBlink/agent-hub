// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MarkdownContent } from "../MarkdownContent";
import { languageForPath } from "./codeLanguages";

it("highlights fenced code with shared parsers and preserves escaped source", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  await languageForPath("snippet.ts")!.load();
  const source = 'const value = "<script>demo</script>";';
  await act(async () =>
    root.render(<MarkdownContent content={"```ts\n" + source + "\n```"} />),
  );
  expect(
    [...host.querySelectorAll("pre code span")].some(
      (node) => node.textContent === "const",
    ),
  ).toBe(true);
  expect(host.querySelector("pre code")?.textContent).toBe(source + "\n");
  expect(host.querySelector("script")).toBeNull();
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
