import { useState } from "react";
import { initialAgents } from "./agentData";
import { initialGroups } from "./launchGroups";

/** One live source; an explicit backup retains a past immutable revision. */
export function useLaunchSettingsPrototype() {
  const [agents, setAgents] = useState(initialAgents);
  const [groups, setGroups] = useState(initialGroups);
  const [defaultAgent, setDefaultAgent] = useState("codex");
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [backup, setBackup] = useState<{
    groups: typeof initialGroups;
    defaultAgent: string;
    time: string;
  } | null>(null);
  const changed =
    !backup ||
    JSON.stringify({ groups, defaultAgent }) !==
      JSON.stringify({
        groups: backup.groups,
        defaultAgent: backup.defaultAgent,
      });
  const createBackup = () =>
    setBackup({
      groups,
      defaultAgent,
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    });
  const restoreBackup = () => {
    if (backup) {
      setGroups(backup.groups);
      setDefaultAgent(backup.defaultAgent);
    }
  };
  return {
    agents,
    setAgents,
    groups,
    setGroups,
    defaultAgent,
    setDefaultAgent,
    backupEnabled,
    setBackupEnabled,
    backup,
    changed,
    createBackup,
    restoreBackup,
  };
}
export type LaunchSettingsPrototype = ReturnType<
  typeof useLaunchSettingsPrototype
>;
