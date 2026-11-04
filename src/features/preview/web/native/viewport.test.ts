import { expect, it } from "vitest";
import { nativeViewportBounds } from "./viewport";
it("fits a large CSS viewport inside its actual native bounds and restores adaptive sizing", () => {
  const rect = { x: 20, y: 40, width: 600, height: 400 };
  expect(nativeViewportBounds(rect, { width: 1200, height: 800 })).toEqual({
    x: 20,
    y: 40,
    width: 600,
    height: 400,
    zoom: 0.5,
  });
  expect(nativeViewportBounds(rect, { width: 300, height: 200 })).toEqual({
    x: 170,
    y: 140,
    width: 300,
    height: 200,
    zoom: 1,
  });
  expect(nativeViewportBounds(rect, null)).toEqual(rect);
});
