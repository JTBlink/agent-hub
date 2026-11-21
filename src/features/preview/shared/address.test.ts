import { describe, expect, it } from "vitest";
import { resolveAddress, sourceLocation } from "./address";
describe("preview address input", () => {
  it("keeps query and encoded fragments on file paths and removes stale fragments", () => {
    const path = "/workspace/site/presentation.html";
    expect(
      sourceLocation(
        path,
        "http://preview.localhost/presentation.html?mode=slides#%E9%A1%B502",
      ),
    ).toBe(`${path}?mode=slides#%E9%A1%B502`);
    expect(
      sourceLocation(path, "http://preview.localhost/presentation.html"),
    ).toBe(path);
    expect(sourceLocation(path)).toBe(path);
  });
  it("uses HTTP for loopback development addresses and searches plain text", () => {
    expect(resolveAddress("localhost:3000/demo", "bing")).toBe(
      "http://localhost:3000/demo",
    );
    expect(resolveAddress("127.0.0.1:8080", "bing")).toBe(
      "http://127.0.0.1:8080/",
    );
    expect(resolveAddress("? CSS grid", "duckduckgo")).toBe(
      "https://duckduckgo.com/?q=CSS%20grid",
    );
    expect(() =>
      resolveAddress("file:///private/document.html", "bing"),
    ).toThrow();
  });
});
