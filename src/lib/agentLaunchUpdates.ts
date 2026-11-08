import type { AgentLaunchSnapshot } from "./agentLaunchConfig";

// Successful reads/saves update every mounted settings entry and default picker.
// This is a notification channel, not a cache: new consumers still read disk.
const listeners = new Set<(snapshot: AgentLaunchSnapshot) => void>();

export function subscribeAgentLaunchUpdates(
  listener: (snapshot: AgentLaunchSnapshot) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishAgentLaunchUpdate(snapshot: AgentLaunchSnapshot) {
  listeners.forEach((listener) => listener(snapshot));
}
