import type { Annotation } from "./session";

export type ContextInput = Pick<
  Annotation,
  "selector" | "text" | "screenshot" | "contextKind"
>;
const TEXT_EXTENSIONS =
  /\.(txt|md|mdx|json|jsonl|log|csv|yaml|yml|toml|xml|html|css|js|jsx|ts|tsx|rs|py|sh|sql|ini|conf)$/i;

async function readImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("PREVIEW_CONTEXT_FILE_INVALID"));
      image.src = url;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 32_000_000
    )
      throw new Error("PREVIEW_CONTEXT_FILE_LIMIT");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PREVIEW_CONTEXT_FILE_INVALID");
    context.drawImage(image, 0, 0);
    const data = canvas.toDataURL("image/png").split(",")[1];
    if (!data || data.length > 3 * 1024 * 1024)
      throw new Error("PREVIEW_CONTEXT_FILE_LIMIT");
    return data;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
  }
}

/** Read only explicitly selected files; keep binary data out of text context. */
export async function readContextFiles(files: File[]): Promise<ContextInput[]> {
  if (files.length > 20) throw new Error("PREVIEW_ANNOTATION_LIMIT");
  const inputs: ContextInput[] = [];
  for (const file of files) {
    if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
      if (file.size > 3 * 1024 * 1024)
        throw new Error("PREVIEW_CONTEXT_FILE_LIMIT");
      inputs.push({
        selector: file.name,
        text: "",
        contextKind: "image",
        screenshot: await readImage(file),
      });
    } else {
      if (!file.type.startsWith("text/") && !TEXT_EXTENSIONS.test(file.name))
        throw new Error("PREVIEW_CONTEXT_FILE_INVALID");
      if (file.size > 64 * 1024) throw new Error("PREVIEW_CONTEXT_FILE_LIMIT");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        );
      } catch {
        throw new Error("PREVIEW_CONTEXT_FILE_INVALID");
      }
      if (text.includes("\0")) throw new Error("PREVIEW_CONTEXT_FILE_INVALID");
      inputs.push({ selector: file.name, text, contextKind: "file" });
    }
  }
  return inputs;
}
