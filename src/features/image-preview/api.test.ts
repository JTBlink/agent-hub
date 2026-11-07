import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { imageMimeType, isPreviewableImage, readProjectImage } from "./api";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
it("wraps binary IPC as an unchanged image Blob and distinguishes absent versions", async () => {
  const bytes = new Uint8Array([0, 128, 255, 7]);
  vi.mocked(invoke)
    .mockResolvedValueOnce(bytes.buffer)
    .mockResolvedValueOnce(new ArrayBuffer(0));
  const source = {
    projectId: "demo",
    path: "ICON.PNG",
    revision: "working" as const,
  };
  const blob = await readProjectImage(source);
  expect(blob?.type).toBe("image/png");
  expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(bytes);
  expect(await readProjectImage(source)).toBeNull();
  expect(imageMimeType("icon.svg")).toBe("image/svg+xml");
  expect(isPreviewableImage("file.constructor")).toBe(false);
  expect(isPreviewableImage("png")).toBe(false);
});
