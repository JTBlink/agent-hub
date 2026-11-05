import { expect, it } from "vitest";
import { readContextFiles } from "./contextFiles";
it("adds multiple UTF-8 reference files without losing names or contents", async () => {
  const inputs = await readContextFiles([
    new File(["布局参考"], "reference.md"),
    new File(['{"width":320}'], "design.json"),
  ]);
  expect(inputs).toEqual([
    { selector: "reference.md", text: "布局参考", contextKind: "file" },
    { selector: "design.json", text: '{"width":320}', contextKind: "file" },
  ]);
});
it("rejects binary, invalid UTF-8, oversized and unsupported files", async () => {
  for (const file of [
    new File(["a\0b"], "binary.txt"),
    new File([new Uint8Array([255])], "invalid.md"),
    new File(["x".repeat(64 * 1024 + 1)], "large.txt"),
    new File(["binary"], "archive.zip"),
  ])
    await expect(readContextFiles([file])).rejects.toThrow(
      /PREVIEW_CONTEXT_FILE_(INVALID|LIMIT)/,
    );
  await expect(
    readContextFiles(
      Array.from({ length: 21 }, () => new File(["x"], "reference.md")),
    ),
  ).rejects.toThrow("PREVIEW_ANNOTATION_LIMIT");
});
