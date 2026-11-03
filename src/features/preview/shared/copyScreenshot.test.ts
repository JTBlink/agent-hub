import { expect, it, vi } from "vitest";
import { copyScreenshot } from "./copyScreenshot";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeImage: vi.fn().mockResolvedValue(undefined),
}));
it("copies native PNG bytes and rejects excessive dimensions before clipboard access", async () => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a5sAAAAASUVORK5CYII=";
  await copyScreenshot(png);
  expect(writeImage).toHaveBeenCalledTimes(1);
  const raw = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
  new DataView(raw.buffer).setUint32(16, 0xffffffff);
  await expect(
    copyScreenshot(btoa(String.fromCharCode(...raw))),
  ).rejects.toThrow("PREVIEW_CLIPBOARD_DIMENSIONS");
  await expect(copyScreenshot(btoa("not an image"))).rejects.toThrow(
    "PREVIEW_CLIPBOARD_INVALID",
  );
  await expect(copyScreenshot("%%%invalid-base64")).rejects.toThrow(
    "PREVIEW_CLIPBOARD_INVALID",
  );
  expect(writeImage).toHaveBeenCalledTimes(1);
});
