/** Manual fixture: /tests/browser/automation-prompts.html?width=900&theme=dark
 * Also check width=380, theme=light and scale=1.25. Uses only synthetic data. */
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import zh from "../../src/i18n/zh.json";
import en from "../../src/i18n/en.json";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AutomationTaskDetail } from "../../src/components/AutomationTaskDetail";
import { AutomationPromptEditor } from "../../src/components/AutomationPromptEditor";
import {
  automationPrompts,
  updateAutomationPrompts,
} from "../../src/lib/automationPrompts";
import type { AutomationDraft, AutomationTask } from "../../src/lib/tauri";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
document.documentElement.style.setProperty(
  "--app-scale",
  params.get("scale") ?? "1",
);
document.body.style.overflow = "auto";
document.documentElement.style.zoom = params.get("scale") ?? "1";
const i18n = createInstance();
await i18n.init({
  lng: params.get("language") ?? "zh",
  resources: { zh: { translation: zh }, en: { translation: en } },
  interpolation: { escapeValue: false },
});
const draft: AutomationDraft = {
  name: "项目巡检",
  provider: "system",
  content: "sh './scripts/run.sh'",
  workdir: null,
  schedule: { kind: "manual" },
  enabled: false,
  files: [
    {
      path: "prompts/prompt.md",
      content: "检查当前项目并报告发现的问题。保留所有文件。",
    },
  ],
};
const variants = [
  {
    id: "review",
    name: "仅评审",
    content: draft.files![0].content,
    variables: [
      {
        name: "scope",
        value: "own",
        description: "own: 当前账号；all: 所有作者",
      },
    ],
  },
  {
    id: "repair",
    name: "评审并修复",
    content: "检查当前项目，修复确认的问题，运行相关验证后汇总结果。",
    variables: [
      {
        name: "scope",
        value: "all",
        options: [
          "own",
          "all",
          "a-long-custom-suggestion-for-checking-menu-layout-at-large-text-sizes",
        ],
      },
    ],
  },
];
const initial = {
  ...draft,
  ...updateAutomationPrompts(draft, variants, "review"),
};
const intervalTask: AutomationTask = {
  id: "preview-interval",
  name: "项目巡检",
  identifier: null,
  bundle_id: null,
  icon: null,
  source: "launchd",
  origin: "agent_hub",
  can_edit: false,
  can_run: true,
  requires_admin: false,
  is_package: true,
  is_builtin: false,
  definition: {
    ...draft,
    enabled: true,
    schedule: { kind: "interval", minutes: 10 },
  },
  revision: 1,
  schedule: "every 10m",
  project: null,
  status: "active",
  next_run: null,
  last_run: null,
  last_result: null,
  command: null,
  prompt: null,
  location: "preview.plist",
};
export function Fixture() {
  const [value, setValue] = useState(initial);
  const state = automationPrompts(value, "默认提示词");
  if (params.has("next-run"))
    return (
      <AutomationTaskDetail
        task={intervalTask}
        projectName={null}
        refreshKey={0}
        loading={false}
        readFailed={false}
        onBack={() => {}}
        onRefresh={() => {}}
      />
    );
  return (
    <main
      className="mx-auto min-h-screen max-w-full bg-background p-4 text-primary"
      style={{ width: Number(params.get("width") ?? 900) }}
    >
      <AutomationPromptEditor
        draft={value}
        disabled={false}
        usesAgent
        inactivePrompt=""
        onChange={(change) =>
          setValue((previous) => ({ ...previous, ...change }))
        }
      />
      <output data-active-prompt className="mt-5 block text-sm">
        当前使用：
        {state.variants.find((variant) => variant.id === state.activeId)?.name}
      </output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <I18nextProvider i18n={i18n}>
    <Fixture />
  </I18nextProvider>,
);
