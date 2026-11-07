import { expect, it } from "vitest";
import { clampZoom, imageLayout } from "./imageZoom";

it("fits large images without enlarging icons and expands scrollable layout when zooming", () => {
  expect(imageLayout(4096, 2048, 1056, 600, 1)).toEqual({
    width: 1024,
    height: 512,
  });
  expect(imageLayout(48, 48, 1056, 600, 1)).toEqual({ width: 48, height: 48 });
  expect(imageLayout(4096, 2048, 1056, 600, 2)).toEqual({
    width: 2048,
    height: 1024,
  });
  expect(clampZoom(0.01)).toBe(0.25);
  expect(clampZoom(100)).toBe(8);
});
