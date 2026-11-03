import { openUrl } from "@tauri-apps/plugin-opener";
import {
  openWebLink,
  preferredLinkDestination,
} from "../../../lib/openWebLink";
import { previewApi, type PreviewDocument } from "../api";
export function documentFragment(address: string): string | undefined {
  const fragment = new URL(address).hash.slice(1);
  if (!fragment) return undefined;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}
/** Local links always pass through the native grant resolver, including system-browser opens. */
export async function followDocumentLink({
  document,
  href,
  invert,
  profile,
  acceptDocument,
  openPage,
}: {
  document: PreviewDocument;
  href: string;
  invert: boolean;
  profile?: string;
  acceptDocument: (document: PreviewDocument, profile?: string) => void;
  openPage: (address: string, profile?: string) => void;
}) {
  if (/^https?:\/\//i.test(href) || href.startsWith("//")) {
    await openWebLink(new URL(href, document.url).href, { invert, profile });
    return;
  }
  if ((await preferredLinkDestination(invert)) === "system") {
    await openUrl(await previewApi.resourceLink(document.id, href));
    return;
  }
  const linked = await previewApi.openLink(document.id, href);
  if (linked.kind === "page") openPage(linked.url, profile);
  else
    acceptDocument(
      {
        ...linked.document,
        fragment: linked.document.url
          ? documentFragment(linked.document.url)
          : undefined,
      },
      profile,
    );
}
