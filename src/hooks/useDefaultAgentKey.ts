import { useEffect, useState } from "react";
import { getAgentLaunchSettings } from "../lib/tauri";

/** Default selection only; explicit scene/project preferences remain authoritative. */
export function useDefaultAgentKey() {
  const [key, setKey] = useState("");
  useEffect(() => {
    let active = true;
    void getAgentLaunchSettings()
      .then((snapshot) => {
        if (active) setKey(snapshot.document.default_agent);
      })
      .catch(() => {
        /* Optional initial selection; startup still validates settings. */
      });
    return () => {
      active = false;
    };
  }, []);
  return key;
}
