import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
/** Copy the PNG produced by either renderer without creating a persistent file. */
export async function copyScreenshot(data: string) {
  if (data.length > 24 * 1024 * 1024)
    throw new Error("PREVIEW_CLIPBOARD_LIMIT");
  let raw: string;
  try {
    raw = atob(data);
  } catch {
    throw new Error("PREVIEW_CLIPBOARD_INVALID");
  }
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  if (
    bytes.length < 24 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  )
    throw new Error("PREVIEW_CLIPBOARD_INVALID");
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width * height > 32_000_000)
    throw new Error("PREVIEW_CLIPBOARD_DIMENSIONS");
  await writeImage(bytes);
}
