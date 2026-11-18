import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { getAgentLaunchSettings } from "../lib/tauri";
import { subscribeAgentLaunchUpdates } from "../lib/agentLaunchUpdates";

/** Default selection only; explicit scene/project preferences remain authoritative. */
export function useDefaultAgentKey() {
  const [key, setKey] = useState("");
  useEffect(() => {
    let active = true;
    let generation = 0;
    const unsubscribe = subscribeAgentLaunchUpdates((snapshot) => {
      ++generation;
      setKey(snapshot.document.default_agent);
    });
    const refresh = () => {
      const request = ++generation;
      return getAgentLaunchSettings()
        .then((snapshot) => {
          if (active && request === generation)
            setKey(snapshot.document.default_agent);
        })
        .catch(() => {
          /* Optional initial selection; startup still validates settings. */
        });
    };
    void refresh();
    const unlisten = listen("app-files-changed", () => void refresh()).catch(
      () => () => {},
    );
    return () => {
      void unlisten.then((dispose) => dispose()).catch(() => {});
      active = false;
      unsubscribe();
    };
  }, []);
  return key;
}
