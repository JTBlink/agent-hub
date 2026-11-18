import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { useAgentLaunchSettings } from "../hooks/useAgentLaunchSettings";
import {
  agentLaunchSchemes,
  selectedLaunchScheme,
} from "../lib/agentLaunchConfig";
import { herdrAgentKind } from "../lib/automationAgents";
import { automationAgentConfig } from "../lib/automation";
import type { AutomationDraft } from "../lib/tauri";
import { ThemedSelect } from "./ThemedSelect";
import { useNavigate } from "react-router-dom";

export function AutomationLaunchSchemeField({
  draft,
  agentKey,
  disabled,
  onChange,
  onValidityChange,
  onOpenSettings,
}: {
  draft: AutomationDraft;
  agentKey: string;
  disabled: boolean;
  onChange: (change: Partial<AutomationDraft>) => void;
  onValidityChange?: (valid: boolean) => void;
  onOpenSettings?: (agentKey: string) => void;
}) {
  const { t } = useTranslation();
  const launch = useAgentLaunchSettings();
  const navigate = useNavigate();
  const config = automationAgentConfig(draft);
  const schemeId = config?.value.launch.scheme_id ?? "";
  const selected =
    launch.snapshot && agentKey
      ? selectedLaunchScheme(launch.snapshot, agentKey, schemeId)
      : undefined;
  const valid = !config || (!!selected && !!selected.instruction.trim());
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);
  if (!config) return null;
  const schemes = launch.snapshot
    ? agentLaunchSchemes(
        launch.snapshot,
        agentKey,
        t("agentLaunch.schemes.automatic"),
      )
    : null;
  const choose = (schemeId: string) => {
    const rest = { ...config.value.launch };
    delete rest.scheme_id;
    onChange({
      files: draft.files?.map((file) =>
        file.path === config.file.path
          ? {
              ...file,
              content:
                JSON.stringify(
                  {
                    ...config.value,
                    ...(schemeId
                      ? {
                          runner: {
                            ...config.value.runner,
                            kind:
                              herdrAgentKind(agentKey) ??
                              config.value.runner.kind,
                          },
                        }
                      : {}),
                    launch: {
                      ...rest,
                      ...(schemeId ? { scheme_id: schemeId } : {}),
                    },
                  },
                  null,
                  2,
                ) + "\n",
            }
          : file,
      ),
    });
  };
  return (
    <div className="space-y-2">
      <label className="block space-y-2">
        <span className="text-xs font-medium text-muted">
          {t("agentLaunch.schemes.label")}
        </span>
        <ThemedSelect
          className="app-input w-full"
          aria-label={t("agentLaunch.schemes.label")}
          value={schemeId}
          disabled={disabled || !schemes}
          onChange={(event) => choose(event.target.value)}
          menuFooterAction={{
            label: t("agentLaunch.schemes.manage"),
            icon: <Settings size={16} />,
            onSelect: () => {
              if (onOpenSettings) onOpenSettings(agentKey);
              else
                navigate(
                  `/settings?agent=${encodeURIComponent(agentKey)}#agents`,
                );
            },
          }}
        >
          <option value="">{t("agentLaunch.schemes.followDefault")}</option>
          {schemes?.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.id === schemes.default_id
                ? ` · ${t("agentLaunch.schemes.default")}`
                : ""}
            </option>
          ))}
          {schemeId && !selected && (
            <option value={schemeId} disabled>
              {t("agentLaunch.schemes.unavailable")}
            </option>
          )}
        </ThemedSelect>
      </label>
      {selected ? (
        <div className="rounded border border-border-subtle bg-surface p-3 text-xs">
          <p className="mb-1 text-muted">
            {t("agentLaunch.schemes.currentInstruction")}
          </p>
          <code className="block break-all leading-5 text-secondary">
            {selected.instruction}
          </code>
          <p className="mt-2 leading-5 text-muted">
            {t(
              schemeId
                ? "agentLaunch.schemes.syncedHelp"
                : "agentLaunch.schemes.followHelp",
            )}
          </p>
        </div>
      ) : (
        <p
          role={launch.snapshot ? "alert" : "status"}
          className="text-xs text-danger"
        >
          {launch.error ||
            t(
              launch.snapshot
                ? "agentLaunch.schemes.unavailable"
                : "common.loading",
            )}
        </p>
      )}
      {launch.error && (
        <div
          role={selected ? "alert" : undefined}
          className="flex items-start gap-2 text-xs text-danger"
        >
          {selected && <span className="flex-1">{launch.error}</span>}
          <button
            type="button"
            className="text-accent"
            disabled={launch.busy}
            onClick={() => void launch.reload()}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
