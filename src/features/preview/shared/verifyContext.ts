import { previewApi } from "../api";
import type { PreviewTab } from "./session";
/** Re-check the native page at the delivery boundary, including while UI polling is paused. */
export async function verifyPreviewContext(
  expected: Pick<PreviewTab, "id" | "revision">,
  current: () => { tab?: PreviewTab; pageId?: string },
  changedMessage: string,
) {
  const before = current();
  if (
    !before.tab ||
    before.tab.id !== expected.id ||
    before.tab.revision !== expected.revision
  )
    throw Error(changedMessage);
  if (before.tab.kind !== "markdown") {
    if (!before.pageId) throw Error(changedMessage);
    await previewApi.action(before.pageId, {
      kind: "verify_revision",
      expected_revision: expected.revision,
    });
  }
  const after = current();
  if (
    !after.tab ||
    after.tab.id !== expected.id ||
    after.tab.revision !== expected.revision ||
    after.tab.kind !== before.tab.kind ||
    after.pageId !== before.pageId
  )
    throw Error(changedMessage);
}
