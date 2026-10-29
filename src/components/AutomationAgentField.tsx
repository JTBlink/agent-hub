import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import { AgentIcon } from "./AgentIcon";
import {
  automationAgentOptions,
  herdrAgentKind,
} from "../lib/automationAgents";
import {
  getAutomationTemplates,
  getToolStatus,
  type ToolInfo,
  type AutomationDraft,
} from "../lib/tauri";
import { automationHerdrConfig, automationPromptFile } from "../lib/automation";
import { getErrorMessage } from "../lib/error";
import { ThemedSelect } from "./ThemedSelect";

type Execution = Pick<AutomationDraft, "provider" | "content" | "files">;
const execution = ({
  provider,
  content,
  files,
}: AutomationDraft): Execution => ({ provider, content, files });

export function AutomationAgentField({
  draft,
  disabled,
  providerLocked,
  onChange,
  onPendingChange,
  onInactivePromptChange,
}: {
  draft: AutomationDraft;
  disabled: boolean;
  providerLocked: boolean;
  onChange: (value: Partial<AutomationDraft>) => void;
  onPendingChange: (pending: boolean) => void;
  onInactivePromptChange: (prompt: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const config = automationHerdrConfig(draft);
  const agent =
    draft.provider === "hermes" ? "native-hermes" : (config?.agent ?? "");
  const [pending, setPending] = useState(false);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const choices = automationAgentOptions(tools).map((tool) => ({
    ...tool,
    value:
      draft.provider === "hermes" && tool.kind === "hermes"
        ? "native-hermes"
        : tool.kind,
  }));
  const selected = choices.find((tool) => tool.value === agent);
  const configured = tools.find(
    (tool) =>
      herdrAgentKind(tool.key) ===
      (agent === "native-hermes" ? "hermes" : agent),
  );
  const icon = (value: string) => {
    const tool =
      choices.find((item) => item.value === value) ??
      (value === agent ? configured : undefined);
    return tool ? (
      <AgentIcon
        agentKey={tool.key}
        displayName={tool.display_name}
        className="h-5 w-5"
      />
    ) : (
      <Terminal className="h-4 w-4 text-muted" />
    );
  };
  const [error, setError] = useState<string | null>(null);
  const shell = useRef<Execution | null>(null);
  const herdr = useRef<Execution | null>(null);
  const prompt = useRef("");
  const mounted = useRef(false);
  const request = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void getToolStatus().then(
      (value) => {
        if (mounted.current) setTools(value);
      },
      (cause) => {
        if (mounted.current) setError(getErrorMessage(cause, ""));
      },
    );
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = async (next: string) => {
    if (disabled || request.current || next === agent) return;
    if (
      providerLocked &&
      (draft.provider === "hermes") !== (next === "native-hermes")
    )
      return;
    request.current = true;
    setError(null);
    const currentPrompt =
      automationPromptFile(draft)?.content ??
      (draft.provider === "hermes" ? draft.content : prompt.current);
    prompt.current = currentPrompt;
    onInactivePromptChange(currentPrompt);
    if (config) herdr.current = execution(draft);
    else if (draft.provider === "system") shell.current = execution(draft);
    if (!next) {
      onChange({
        ...(shell.current ?? { provider: "system", content: "", files: [] }),
        ...(draft.schedule.kind === "custom"
          ? { schedule: { kind: "daily", hour: 9, minute: 0, weekdays: true } }
          : {}),
      });
      request.current = false;
      return;
    }
    if (next === "native-hermes") {
      onChange({
        provider: "hermes",
        content: currentPrompt,
        files: [],
        ...(draft.schedule.kind === "manual"
          ? { schedule: { kind: "interval", minutes: 60 } }
          : {}),
      });
      request.current = false;
      return;
    }
    setPending(true);
    onPendingChange(true);
    try {
      let base = config ? execution(draft) : herdr.current;
      if (!base) {
        const catalog = await getAutomationTemplates(
          i18n.resolvedLanguage ?? i18n.language,
        );
        const starter =
          catalog.agent_starter ??
          catalog.templates.find((template) =>
            automationHerdrConfig(template.draft),
          )?.draft;
        if (!starter) throw new Error(t("automation.agentStarterUnavailable"));
        base = execution(starter);
      }
      if (!mounted.current) return;
      onChange({
        provider: "system",
        content: base.content,
        files: base.files?.map((file) => {
          if (file.path === "prompt.md" || file.path.endsWith("/prompt.md"))
            return { ...file, content: currentPrompt };
          if (file.path === "herdr.json" || file.path.endsWith("/herdr.json")) {
            const parsed: unknown = JSON.parse(file.content);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
              throw new Error(t("automation.agentStarterUnavailable"));
            return {
              ...file,
              content:
                JSON.stringify(
                  {
                    ...parsed,
                    agent: next,
                    ...("agent" in parsed && next === parsed.agent
                      ? {}
                      : {
                          arguments:
                            next === "codex"
                              ? ["--dangerously-bypass-approvals-and-sandbox"]
                              : [],
                          extra_arguments: "",
                        }),
                  },
                  null,
                  2,
                ) + "\n",
            };
          }
          return file;
        }),
        ...(draft.schedule.kind === "custom"
          ? { schedule: { kind: "daily", hour: 9, minute: 0, weekdays: true } }
          : {}),
      });
    } catch (cause) {
      if (mounted.current)
        setError(getErrorMessage(cause, t("automation.saveFailed")));
    } finally {
      request.current = false;
      if (mounted.current) {
        setPending(false);
        onPendingChange(false);
      }
    }
  };
  return (
    <div className="space-y-2">
      <label className="block space-y-2">
        <span className="text-[12px] font-medium text-muted">
          {t("automation.optionalAgent")}
        </span>
        <ThemedSelect
          className="app-input w-full"
          leadingIcon={icon(agent)}
          optionIcon={icon}
          aria-label={t("automation.optionalAgent")}
          value={agent}
          disabled={disabled || pending}
          onChange={(event) => void choose(event.target.value)}
        >
          <option
            value=""
            disabled={providerLocked && draft.provider === "hermes"}
          >
            {t("automation.noAgent")}
          </option>
          {choices.map((tool) => (
            <option
              key={tool.key}
              value={tool.value}
              disabled={
                providerLocked &&
                (draft.provider === "hermes") !==
                  (tool.value === "native-hermes")
              }
            >
              {tool.display_name}
            </option>
          ))}
          {agent && !selected && (
            <option value={agent} disabled>
              {configured?.display_name ?? agent} ·{" "}
              {t("automation.agentUnavailable")}
            </option>
          )}
        </ThemedSelect>
      </label>
      {pending && (
        <p role="status" className="text-[11px] text-muted">
          {t("common.loading")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      )}
      <p className="text-[11px] leading-5 text-muted">
        {t(
          agent
            ? agent === "native-hermes"
              ? "automation.hermesHelp"
              : "automation.herdrExecutionHelp"
            : "automation.noAgentHelp",
        )}
      </p>
    </div>
  );
}
