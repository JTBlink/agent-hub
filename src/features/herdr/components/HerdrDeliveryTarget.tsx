import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../../../components/ThemedSelect";
import { getErrorMessage } from "../../../lib/error";
import {
  getHerdrInventory,
  getHerdrSnapshot,
  herdrTarget,
  type HerdrSessionInfo,
  type HerdrSnapshot,
  type HerdrTarget,
} from "../api";

/** Discovery is read-only; selecting a target never starts a session or Agent. */
export function HerdrDeliveryTarget({
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (target: HerdrTarget | null) => void;
}) {
  const { t } = useTranslation();
  const [inventory, setInventory] = useState<{
    installed: boolean;
    sessions: HerdrSessionInfo[];
  }>();
  const [session, setSession] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [pane, setPane] = useState("");
  const [snapshot, setSnapshot] = useState<HerdrSnapshot>();
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const result = await getHerdrInventory();
        if (!disposed) setInventory(result);
      } catch (error) {
        if (!disposed) setError(getErrorMessage(error, t("common.error")));
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [generation, t]);
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    void (async () => {
      try {
        const result = await getHerdrSnapshot(session);
        if (!disposed) setSnapshot(result);
      } catch (error) {
        if (!disposed) setError(getErrorMessage(error, t("common.error")));
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [session, t]);
  const agents =
    snapshot?.agents.filter(
      (item) => item.workspace_id === workspace && item.agent,
    ) ?? [];
  const selected = agents.find((item) => item.pane_id === pane);
  const directory = snapshot?.workspaces.find(
    (item) => item.workspace_id === workspace,
  )?.directory;
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <label>
        {t("preview.herdrSession")}
        <ThemedSelect
          disabled={disabled || loading}
          value={session}
          onChange={(event) => {
            setSession(event.target.value);
            setWorkspace("");
            setPane("");
            setSnapshot(undefined);
            setError("");
            setLoading(!!event.target.value);
            onChange(null);
          }}
        >
          <option value="">{t("preview.chooseSession")}</option>
          {inventory?.sessions.map((item) => (
            <option key={item.name} value={item.name} disabled={!item.running}>
              {item.name}
              {!item.running ? ` · ${t("preview.sessionStopped")}` : ""}
            </option>
          ))}
        </ThemedSelect>
      </label>
      <label>
        {t("preview.herdrWorkspace")}
        <ThemedSelect
          value={workspace}
          disabled={disabled || !snapshot}
          onChange={(event) => {
            setWorkspace(event.target.value);
            setPane("");
            onChange(null);
          }}
        >
          <option value="">{t("preview.chooseWorkspace")}</option>
          {snapshot?.workspaces.map((item) => (
            <option key={item.workspace_id} value={item.workspace_id}>
              {item.label} · {item.directory ?? item.workspace_id}
            </option>
          ))}
        </ThemedSelect>
      </label>
      <label>
        {t("preview.herdrAgent")}
        <ThemedSelect
          value={pane}
          disabled={disabled || !workspace}
          onChange={(event) => {
            const id = event.target.value;
            setPane(id);
            const agent = agents.find((item) => item.pane_id === id);
            onChange(agent ? herdrTarget(session, agent) : null);
          }}
        >
          <option value="">{t("preview.chooseAgent")}</option>
          {agents.map((item) => (
            <option key={item.pane_id} value={item.pane_id}>
              {item.name || item.agent} · {item.pane_id} · {item.agent_status}
            </option>
          ))}
        </ThemedSelect>
      </label>
      {selected && (
        <p className="text-xs break-all" role="status">
          {t("preview.deliveryTo")}: {session} → {directory || workspace} →{" "}
          {selected.name || selected.agent} ({pane})
        </p>
      )}
      {loading && <p role="status">{t("common.loading")}</p>}
      {!loading && !error && (
        <p className="text-xs text-muted" role="status">
          {inventory?.installed === false
            ? t("preview.herdrMissing")
            : !inventory?.sessions.some((item) => item.running)
              ? t("preview.herdrStopped")
              : snapshot && !snapshot.workspaces.length
                ? t("preview.noWorkspaces")
                : workspace && !agents.length
                  ? t("preview.noAgents")
                  : ""}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        className="app-button-ghost"
        onClick={() => {
          onChange(null);
          setSession("");
          setWorkspace("");
          setPane("");
          setSnapshot(undefined);
          setError("");
          setLoading(true);
          setInventory(undefined);
          setGeneration((value) => value + 1);
        }}
      >
        {t("preview.refreshTargets")}
      </button>
    </fieldset>
  );
}
