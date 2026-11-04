/** Match by tab identity so hidden workspace previews cannot supply another page's DOM. */
export function previewMarkdownElement(tabId: string): HTMLElement | null {
  const container = [
    ...document.querySelectorAll<HTMLElement>("[data-preview-tab-id]"),
  ].find((element) => element.dataset.previewTabId === tabId);
  return container?.querySelector<HTMLElement>(".preview-markdown") ?? null;
}
