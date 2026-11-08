import { useEffect, useState } from "react";
import { getAgentLaunchSettings } from "../lib/tauri";
import { subscribeAgentLaunchUpdates } from "../lib/agentLaunchUpdates";

/** Default selection only; explicit scene/project preferences remain authoritative. */
export function useDefaultAgentKey() {
  const [key, setKey] = useState("");
  useEffect(() => {
    let active = true;
    let updated = false;
    const unsubscribe = subscribeAgentLaunchUpdates((snapshot) => {
      updated = true;
      setKey(snapshot.document.default_agent);
    });
    void getAgentLaunchSettings()
      .then((snapshot) => {
        if (active && !updated) setKey(snapshot.document.default_agent);
      })
      .catch(() => {
        /* Optional initial selection; startup still validates settings. */
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return key;
}
