import { useRef, useState } from "react";
import type { BrowserAction } from "../api";
import type { BrowserNavigation } from "./types";
/** Each backend keeps its own identity; native handles never enter CDP inventory. */
export function useBrowserBackends() {
  const [nativeTabs, setNativeTabs] = useState<Record<string, boolean>>({});
  const navigation = useRef<Record<string, BrowserNavigation>>({});
  const registerNative = (id: string, handler: BrowserNavigation | null) => {
    if (handler) navigation.current[id] = handler;
    else delete navigation.current[id];
  };
  return {
    nativeTabs,
    setNativeTabs,
    registerNative,
    action: async (id: string, action: BrowserAction) => {
      if (
        action.kind !== "back" &&
        action.kind !== "forward" &&
        action.kind !== "reload"
      )
        return false;
      await navigation.current[id]?.(action.kind);
      return true;
    },
  };
}
