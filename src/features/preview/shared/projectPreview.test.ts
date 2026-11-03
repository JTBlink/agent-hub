import { expect, it } from "vitest";
import { canPreviewDocument } from "./projectPreview";

it("offers browser rendering for documents, images, text and media", () => {
  for (const path of [
    "guide.md",
    "index.HTML",
    "photo.PNG",
    "image.svg",
    "document.pdf",
    "data.json",
    "feed.xml",
    "src/main.rs",
    "notes.txt",
    "clip.webm",
    "audio.mp3",
    "video.mp4",
    "C:\\site\\image.JPG",
  ]) {
    expect(canPreviewDocument(path), path).toBe(true);
  }
  for (const path of [
    "archive.zip",
    "app.exe",
    "picture.png.bak",
    "Makefile",
    "png",
  ]) {
    expect(canPreviewDocument(path), path).toBe(false);
  }
});
