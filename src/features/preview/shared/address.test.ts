import { describe, expect, it } from "vitest";
import { resolveAddress } from "./address";
describe("preview address input", () => {
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
