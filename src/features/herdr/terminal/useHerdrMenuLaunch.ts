import { useTranslation } from "react-i18next";
import { getAgentLaunchSettings } from "../../../lib/tauri";
import {
  installedTerminalAgents,
  defaultTerminalAgent,
  type HerdrAgent,
} from "../../../lib/terminalAgents";
import type { ToolInfo } from "../../../lib/tauri";
import { openProjectHerdrAgent } from "../lib/projectAgent";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as api from "../api";
import { worktreeUrl } from "../../../lib/worktreeApi";
import { getErrorMessage } from "../../../lib/error";

/** Explicit menu intent uses the same verified attachment flow as the sidebar. */
export function useHerdrMenuLaunch(
  projectId: string,
  path: string | undefined,
  onSelect?: () => void,
  tools: readonly ToolInfo[] = [],
) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const sequence = useRef(0);
  const mounted = useRef(false);
  const context = useRef({ projectId, path, key: location.key, onSelect });
  useLayoutEffect(() => {
    context.current = { projectId, path, key: location.key, onSelect };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = async (agent?: HerdrAgent): Promise<boolean> => {
    if (pending.current || !projectId) return false;
    const scope = context.current;
    const request = ++sequence.current;
    let attached = false;
    const valid = () =>
      mounted.current &&
      sequence.current === request &&
      context.current.projectId === scope.projectId &&
      context.current.path === scope.path &&
      (attached || context.current.key === scope.key);
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const settings = await getAgentLaunchSettings();
      if (!valid()) return false;
      const choices = installedTerminalAgents(tools);
      const choice = agent
        ? choices.find((item) => item.id === agent)
        : defaultTerminalAgent(choices, settings.document.default_agent);
      if (!choice) throw new Error(t("herdr.noInstalledAgent"));
      const inventory = await api.getHerdrInventory();
      if (!valid()) return false;
      if (!inventory.installed) await api.installHerdr();
      if (!valid()) return false;
      await api.prepareHerdrSession();
      if (!valid()) return false;
      const opened = await openProjectHerdrAgent(
        scope.projectId,
        scope.path,
        choice.id,
        valid,
        (created) => {
          if (!valid()) return;
          attached = true;
          pending.current = false;
          setBusy(false);
          scope.onSelect?.();
          navigate(worktreeUrl(created.project_id, created.path), {
            state: { preserveSidebar: true, herdrAttachment: created },
          });
        },
      );
      if (!opened || !valid()) return attached;
      if (!attached) {
        scope.onSelect?.();
        navigate(worktreeUrl(opened.project_id, opened.path), {
          state: { preserveSidebar: true, herdrAttachment: opened },
        });
      } else if (opened.warning) setError(opened.warning);
      return true;
    } catch (cause) {
      if (valid()) setError(getErrorMessage(cause, String(cause)));
      return attached;
    } finally {
      if (sequence.current === request) {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  };
  return { open, busy, error };
}
