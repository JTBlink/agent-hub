import { previewMarkdownElement } from "./previewElements";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewModel } from "../usePreviewWorkspace";
import { findInDocument } from "./find";
interface Search {
  query: string;
  index: number;
  count: number;
  revision: string;
  attempted?: boolean;
}
export function usePageFind(model: PreviewModel) {
  const { t } = useTranslation();
  const [searches, setSearches] = useState<Record<string, Search>>({});
  const id = model.active?.id ?? "",
    revision = model.active?.revision ?? "";
  const search = searches[id];
  const current =
    search?.revision === revision
      ? search
      : { query: search?.query ?? "", index: -1, count: 0, revision };
  const setFind = (query: string) =>
    setSearches((previous) => ({
      ...previous,
      [id]: { query, index: -1, count: 0, revision },
    }));
  const findPage = async (backwards = false) => {
    if (!model.active || !current.query) return;
    let match: { count: number; index: number };
    if (model.pageId) {
      const result = await model.action<{ found: boolean; count: number }>({
        kind: "find",
        text: current.query,
        backwards,
      });
      const count = result?.found ? result.count : 0;
      match = {
        count,
        index: count
          ? current.index < 0
            ? backwards
              ? count - 1
              : 0
            : (current.index + (backwards ? -1 : 1) + count) % count
          : -1,
      };
    } else {
      const root = previewMarkdownElement(id);
      if (!root) return;
      match = findInDocument(root, current.query, current.index, backwards);
    }
    if (
      model.sessionRef.current.tabs.find((tab) => tab.id === id)?.revision !==
      revision
    )
      return;
    setSearches((previous) => ({
      ...previous,
      [id]: { ...current, ...match, attempted: true },
    }));
  };
  return {
    find: current.query,
    setFind,
    findPage,
    findResult: current.attempted
      ? current.count
        ? t("preview.matchPosition", {
            current: current.index + 1,
            count: current.count,
          })
        : t("preview.noMatches")
      : "",
  };
}
