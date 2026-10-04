import { describe, expect, it } from "vitest";
import { compactHomePath } from "./utils";

describe("compactHomePath", () => {
  it("displays Windows extended paths without changing their meaning", () => {
    expect(compactHomePath(String.raw`\\?\D:\workspace\demo`)).toBe(
      String.raw`D:\workspace\demo`,
    );
    expect(compactHomePath(String.raw`\\?\UNC\server\share\demo`)).toBe(
      String.raw`\\server\share\demo`,
    );
    expect(compactHomePath(String.raw`D:\workspace/demo`)).toBe(
      String.raw`D:\workspace\demo`,
    );
  });
});
