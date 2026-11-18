/** Real settings, task scheme field and terminal menu, with isolated IPC only. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import zh from "../../src/i18n/zh.json";
import en from "../../src/i18n/en.json";
import tw from "../../src/i18n/zh-TW.json";
import { AgentLaunchEditor } from "../../src/components/settings/AgentLaunchEditor";
import { AutomationLaunchSchemeField } from "../../src/components/AutomationLaunchSchemeField";
import { TerminalNewMenu } from "../../src/components/terminal/TerminalNewMenu";
import { useAgentLaunchSettings } from "../../src/hooks/useAgentLaunchSettings";
import {
  selectedLaunchScheme,
  type AgentLaunchDocument,
  type AgentLaunchSnapshot,
} from "../../src/lib/agentLaunchConfig";
import type { AutomationDraft } from "../../src/lib/tauri";
import "../../src/index.css";
const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
const scale = params.get("scale") ?? "1";
document.documentElement.style.setProperty("--app-scale", scale);
document.documentElement.style.zoom = scale;
const defaults = {
  codex: "codex --dangerously-bypass-approvals-and-sandbox",
  claude_code: "claude --dangerously-skip-permissions",
  opencode: "opencode --auto",
  hermes: "hermes --yolo",
};
let stored: AgentLaunchSnapshot = {
  revision: "0",
  defaults,
  document: { schema_version: 2, default_agent: "codex", schemes: {} },
};
const writes: AgentLaunchDocument[] = [];
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (
      command: string,
      args: { document: AgentLaunchDocument; revision: string },
    ) => {
      if (command === "agent_launch_settings") return structuredClone(stored);
      if (command === "save_agent_launch_settings") {
        if (args.revision !== stored.revision)
          throw new Error("Revision conflict");
        writes.push(structuredClone(args.document));
        stored = {
          ...stored,
          revision: String(Number(stored.revision) + 1),
          document: structuredClone(args.document),
        };
        return structuredClone(stored);
      }
      throw new Error(`Unexpected fixture IPC: ${command}`);
    },
  },
});
const i18n = createInstance();
await i18n.init({
  lng: params.get("language") ?? "zh",
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    "zh-TW": { translation: tw },
  },
  interpolation: { escapeValue: false },
});
const initial: AutomationDraft = {
  name: "Review",
  content: "sh ./run.sh",
  provider: "system",
  workdir: null,
  schedule: { kind: "manual" },
  enabled: false,
  files: [
    {
      path: "config/agent.json",
      content: JSON.stringify({
        runner: { kind: "codex", session: "default", title: "Review" },
        launch: { arguments: [] },
        execution: { wait_timeout_seconds: 1800 },
      }),
    },
  ],
};
export function Fixture() {
  const settings = useAgentLaunchSettings();
  const [draft, setDraft] = useState(initial);
  const [selection, setSelection] = useState("");
  const [valid, setValid] = useState(true);
  const launch = (agent = "codex", schemeId?: string, backend = "terminal") => {
    const key =
      agent === "claude" || agent === "claude_teams" ? "claude_code" : agent;
    const scheme =
      settings.snapshot &&
      selectedLaunchScheme(settings.snapshot, key, schemeId);
    setSelection(
      JSON.stringify({
        agent,
        scheme_id: schemeId,
        backend,
        instruction: scheme?.instruction,
      }),
    );
  };
  Object.assign(window, {
    agentLaunchFixture: { writes, stored, draft, valid },
  });
  return (
    <main className="space-y-5 bg-background p-5 text-primary">
      <h1>Agent launch schemes acceptance</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <section
          id="settings-scene"
          className="min-w-0 rounded border border-border bg-surface p-4"
        >
          <h2>Agent settings</h2>
          <AgentLaunchEditor
            agentKey="codex"
            agentName="Codex"
            controller={settings}
            saveOnUnmount
          />
        </section>
        <section
          id="automation-scene"
          className="min-w-0 rounded border border-border bg-bg-secondary p-4"
        >
          <h2>Automation</h2>
          <AutomationLaunchSchemeField
            draft={draft}
            agentKey="codex"
            disabled={false}
            onChange={(patch) =>
              setDraft((current) => ({ ...current, ...patch }))
            }
            onValidityChange={setValid}
          />
          <button
            type="button"
            disabled={!valid}
            className="app-button-primary mt-3"
          >
            Save task
          </button>
        </section>
      </div>
      <section id="terminal-scene" className="rounded border border-border p-4">
        <h2>Terminal / Herdr</h2>
        <TerminalNewMenu
          disabled={false}
          tools={[
            { key: "codex", installed: true },
            { key: "claude_code", installed: true },
          ]}
          onNew={(agent, scheme) => launch(agent, scheme)}
          onHerdr={(agent, scheme) => launch(agent, scheme, "herdr")}
          onHerdrSettings={() => setSelection("Herdr settings")}
        />
        <output
          id="launch-selection"
          className="mt-4 block break-all font-mono text-xs"
        >
          {selection}
        </output>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <I18nextProvider i18n={i18n}>
    <MemoryRouter>
      <Fixture />
    </MemoryRouter>
  </I18nextProvider>,
);
