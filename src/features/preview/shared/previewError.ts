import { getErrorMessage } from "../../../lib/error";
const messages: Record<string, string> = {
  PREVIEW_DOWNLOAD_UNVERIFIED: "preview.downloadSourceUnverified",
  PREVIEW_CONTEXT_CHANGED: "preview.pageChanged",
  PREVIEW_REOPEN_BUSY: "preview.reopenBusy",
  PREVIEW_REOPEN_UNCERTAIN: "preview.reopenUncertain",
  PREVIEW_PAGE_GONE: "preview.pageGone",
  PREVIEW_TAB_LIMIT: "preview.tabLimit",
  PREVIEW_ANNOTATION_LIMIT: "preview.annotationLimit",
  PREVIEW_CAPTURE_LIMIT: "preview.captureLimit",
  PREVIEW_CLIPBOARD_LIMIT: "preview.clipboardLimit",
  PREVIEW_CLIPBOARD_INVALID: "preview.clipboardInvalid",
  PREVIEW_CLIPBOARD_DIMENSIONS: "preview.clipboardDimensions",
};
export function previewError(
  error: unknown,
  translate: (key: string) => string,
) {
  const message = getErrorMessage(error, translate("common.error"));
  const key = Object.keys(messages).find((key) => message.includes(key));
  return key ? translate(messages[key]) : message;
}
