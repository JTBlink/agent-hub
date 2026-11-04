import { useEffect, useState } from "react";
import { getSettings, setSettings } from "../../../lib/tauri";
import type { SearchEngine } from "./address";

export function usePreviewSearchEngine(onError: (error: unknown) => void) {
  const [searchEngine, setValue] = useState<SearchEngine>("bing");
  useEffect(() => {
    let disposed = false;
    void getSettings("preview_search_engine")
      .then((value) => {
        if (
          !disposed &&
          (value === "bing" || value === "google" || value === "duckduckgo")
        )
          setValue(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);
  const setSearchEngine = (value: SearchEngine) => {
    setValue(value);
    void setSettings("preview_search_engine", value).catch(onError);
  };
  return { searchEngine, setSearchEngine };
}
