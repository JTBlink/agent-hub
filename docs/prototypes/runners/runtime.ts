// Isolated read-only demo bridge: never forwards requests to desktop IPC.
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "../../../src/i18n/zh.json";
import { makeTaskDevelopment } from "../../../tests/fixtures/repositoryTask";
import { demoTasks } from "./task-demo";

Object.assign(window, {
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    unregisterCallback: () => {},
    invoke: async (
      command: string,
      args: {
        target?: { host?: string };
        query?: { binding_id?: string; number?: number; kind?: string };
      } = {},
    ) => {
      if (command === "platform_account_contexts")
        return [
          {
            id: "prototype-gitlab",
            provider: "gitlab",
            host: "gitlab.example.invalid",
            label: "",
            project_scoped: false,
            remembered: false,
          },
          {
            id: "prototype-github",
            provider: "github",
            host: "github.com",
            label: "",
            project_scoped: false,
            remembered: false,
          },
        ];
      if (command === "platform_account_list")
        return {
          accounts: [
            {
              host: args.target?.host || "github.com",
              username: "demo",
              active: true,
              authenticated: true,
              switchable: false,
            },
          ],
        };
      if (
        [
          "task_cancel",
          "platform_account_cancel",
          "plugin:opener|open_url",
        ].includes(command)
      )
        return;
      if (command === "task_project_remotes") return [];
      if (command === "task_detail") {
        const query = args.query;
        const summary =
          demoTasks.find(
            (t) =>
              t.binding_id === query?.binding_id &&
              t.number === query?.number &&
              t.kind === query?.kind,
          ) ?? demoTasks[0];
        return {
          summary,
          body: `## ${summary.title}\n\n这是原型演示内容。保留现有详情、上下文、评论和 Agent 启动入口。`,
          comments: [],
          has_more_comments: false,
          development: makeTaskDevelopment(),
        };
      }
      throw new Error("交互原型：此操作不调用真实系统或远端平台");
    },
  },
});
export const prototypeI18n = createInstance();
await prototypeI18n.use(initReactI18next).init({
  lng: "zh",
  resources: { zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
