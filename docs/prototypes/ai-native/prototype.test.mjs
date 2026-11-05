import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { prototypePath } from "../../../scripts/prototype/catalog.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const open = (query = "") =>
  new JSDOM(html, {
    url: `https://example.invalid/docs/prototypes/ai-native/${query}`,
    runScripts: "dangerously",
    beforeParse(window) {
      window.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      window.HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    },
  });

function confirmPrototype(window) {
  if (!window.current().chatDraft?.trim())
    window.generateRequirementPrototype();
  window.guideConfirmRequirement();
}

it("opens the sidebar from catalog and CLI preview links while keeping the bare flag page disabled", () => {
  const catalog = JSON.parse(
    readFileSync(new URL("../catalog.json", import.meta.url), "utf8"),
  );
  const index = new JSDOM(
    readFileSync(new URL("../index.html", import.meta.url), "utf8"),
    {
      url: "https://example.invalid/docs/prototypes/",
      runScripts: "outside-only",
      beforeParse(window) {
        window.matchMedia = () => ({ matches: false });
      },
    },
  );
  const script = readFileSync(
    new URL("../catalog.mjs", import.meta.url),
    "utf8",
  ).replace(
    'import entries from "./catalog.json";',
    `const entries = ${JSON.stringify(catalog)};`,
  );
  index.window.eval(script);
  const links = [
    ...index.window.document.querySelectorAll("article:first-child a"),
  ];
  expect(new URL(links[0].href).searchParams.get("view")).toBe("sidebar");
  expect(links.some((link) => /^方案 [ABC]$/.test(link.textContent))).toBe(
    false,
  );
  const url = new URL(links[0].href);
  expect(prototypePath("ai-native")).toBe(url.pathname + url.search);
  const sidebar = open(url.search);
  expect(
    sidebar.window.document.querySelector('[aria-label="AI Native"]'),
  ).not.toBeNull();
  expect(sidebar.window.document.getElementById("variant-label")).toBeNull();
  sidebar.window.close();
  const flagLink = links.find((link) => link.textContent === "开关页面");
  expect(new URL(flagLink.href).search).toBe("");
  const flags = open();
  expect(
    flags.window.document.querySelector('[aria-label="AI Native"]'),
  ).toBeNull();
  expect(
    flags.window.document
      .querySelector('[role="switch"]')
      .getAttribute("aria-checked"),
  ).toBe("false");
  flags.window.close();
  index.window.close();
});

it("runs CLI-generated requirements and Cases automatically while other tasks keep progressing independently", () => {
  const preview = open("?view=sidebar");
  const window = preview.window;
  const document = window.document;
  const activeId = () =>
    document.querySelector('[data-task][aria-current="page"]').dataset.task;
  const finish = (id) => {
    for (let i = 0; i < 30; i++) window.advanceTask(id);
  };
  try {
    expect(document.querySelectorAll("#main .primary")).toHaveLength(1);
    expect(document.getElementById("step-name")).toBeNull();
    expect(document.querySelector(".prototype-options").open).toBe(false);
    window.guideUpdateGoal("");
    window.guideSubmit();
    expect(document.getElementById("goal-error").textContent).toContain(
      "请先描述",
    );
    window.guideUpdateGoal("需求一：保留项目切换上下文");
    window.guideSubmit();
    expect(document.querySelector(".guide-run-state")).toBeNull();
    confirmPrototype(window);
    const first = activeId();
    expect(document.querySelectorAll(".guide-track button")).toHaveLength(3);
    expect(document.querySelectorAll(".guide-case")).toHaveLength(0);
    expect(document.querySelector(".guide-run-state").textContent).toContain(
      "正在生成需求",
    );
    window.newTask();
    const second = activeId();
    expect(second).not.toBe(first);
    window.guideChooseScene("mr");
    const field = document.getElementById("task-goal");
    field.value = "需求二：修复当前 MR 的 CI";
    field.dispatchEvent(new window.Event("input"));
    field.focus();
    finish(first);
    expect(document.getElementById("task-goal")).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("需求二：修复当前 MR 的 CI");
    expect(
      document.querySelector(`[data-task="${first}"]`).textContent,
    ).toContain("待验收");
    window.guideSubmit();
    confirmPrototype(window);
    window.activateTask(first);
    window.guideGo(2);
    expect(document.querySelector(".guide-goal-summary").textContent).toContain(
      "需求一",
    );
    finish(second);
    expect(activeId()).toBe(first);
    window.acceptRun();
    expect(
      document.querySelector(`[data-task="${first}"]`).textContent,
    ).toContain("已完成");
    expect(
      document.querySelector(`[data-task="${second}"]`).textContent,
    ).toContain("待验收");
    window.activateTask(second);
    window.guideGo(2);
    expect(document.querySelector(".guide-goal-summary").textContent).toContain(
      "需求二",
    );
    window.guideBlock();
    window.acceptRun();
    expect(
      document.querySelector(`[data-task="${second}"]`).textContent,
    ).toContain("需处理");
  } finally {
    window.close();
  }
});

it("keeps advanced orchestration optional and returns to the current guided task", () => {
  const preview = open("?view=sidebar");
  try {
    const window = preview.window;
    window.guideUpdateGoal("保留当前需求草稿");
    window.toggleExpert();
    expect(window.document.getElementById("step-name")).not.toBeNull();
    window.toggleExpert();
    expect(window.document.getElementById("task-goal").value).toBe(
      "保留当前需求草稿",
    );
  } finally {
    preview.window.close();
  }
});

it("uses Herdr first and falls back to the embedded terminal without a human Case checkpoint", () => {
  const preview = open("?view=sidebar");
  const window = preview.window;
  try {
    expect(window.launchLabel()).toBe("Herdr");
    window.current().demoHerdrInstalled = false;
    expect(window.launchLabel()).toBe("内嵌终端（Herdr 未安装）");
    window.current().launchMode = "embedded";
    expect(window.launchLabel()).toBe("内嵌终端");
    const steps = window.current().steps;
    expect(steps.find((step) => step.id === "requirements").when).toBe(
      "on_success",
    );
    expect(steps.find((step) => step.id === "cases").when).toBe("on_success");
    window.guideUpdateGoal("由命令行 Agent 实现项目切换");
    window.guideSubmit();
    confirmPrototype(window);
    const first = window.document.querySelector(
      '[data-task][aria-current="page"]',
    ).dataset.task;
    for (let i = 0; i < 30; i++) window.advanceTask(first);
    const output = window.document.querySelector(".terminal").textContent;
    expect(output).toContain("内嵌终端");
    expect(output.indexOf("生成需求与验收标准")).toBeLessThan(
      output.indexOf("生成测试 Case 并留档"),
    );
    expect(output.indexOf("生成测试 Case 并留档")).toBeLessThan(
      output.indexOf("目标测试出现预期失败"),
    );
    window.guideGo(2);
    expect(window.document.querySelector(".panel-head h2").textContent).toBe(
      "交付结果",
    );
    expect(window.document.querySelector("#main").textContent).not.toContain(
      "确认 Case",
    );
  } finally {
    window.close();
  }
});

it("preserves multi-round requirements per task and starts only after the current summary is confirmed", () => {
  const preview = open("?view=sidebar");
  const window = preview.window;
  const document = window.document;
  try {
    window.guideUpdateGoal("优化项目切换");
    window.guideSubmit();
    expect(document.querySelectorAll(".discussion-message")).toHaveLength(2);
    expect(document.querySelector(".guide-run-state")).toBeNull();
    const first = document.querySelector('[data-task][aria-current="page"]')
      .dataset.task;
    window.guideUpdateGoal("保留未保存的输入，异常时允许恢复");
    confirmPrototype(window);
    expect(document.getElementById("goal-error").textContent).toContain(
      "未发送",
    );
    window.guideSubmit();
    expect(document.querySelectorAll(".discussion-message")).toHaveLength(4);
    expect(
      document.querySelector(".requirement-summary").textContent,
    ).toContain("异常时允许恢复");
    window.newTask();
    window.guideUpdateGoal("处理另一条需求");
    window.guideSubmit();
    expect(document.querySelectorAll(".discussion-message")).toHaveLength(2);
    window.activateTask(first);
    expect(document.querySelectorAll(".discussion-message")).toHaveLength(4);
    confirmPrototype(window);
    expect(document.querySelector(".guide-run-state")).not.toBeNull();
    expect(window.taskPrompt()).toContain("保留未保存的输入");
    expect(window.current().confirmedSummary.messageCount).toBe(4);
  } finally {
    window.close();
  }
});

it("exports one HTML requirement artifact and rejects confirmation of a stale revision", () => {
  const preview = open("?view=sidebar");
  const window = preview.window;
  let standalone;
  try {
    window.guideUpdateGoal("交付可操作的需求原型");
    window.guideSubmit();
    window.guideConfirmRequirement();
    expect(window.document.querySelector(".guide-run-state")).toBeNull();
    window.generateRequirementPrototype();
    const original = window.current().requirementPrototype;
    expect(window.document.getElementById("requirement-frame").srcdoc).toBe(
      original.html,
    );
    expect(
      window.document
        .getElementById("requirement-frame")
        .getAttribute("sandbox"),
    ).toBe("allow-scripts");
    const exported = [];
    window.download = (...args) => exported.push(args);
    window.downloadRequirementPrototype();
    expect(exported[0]).toEqual([
      original.filename,
      original.html,
      "text/html",
    ]);
    standalone = new JSDOM(original.html, { runScripts: "dangerously" });
    standalone.window.document.querySelector("button").click();
    expect(
      standalone.window.document.getElementById("result").textContent,
    ).toContain("已完成演示操作");
    window.closeModal();
    window.guideUpdateGoal("保留异常恢复操作");
    window.guideSubmit();
    window.guideConfirmRequirement();
    expect(window.document.querySelector(".guide-run-state")).toBeNull();
    expect(
      window.document.querySelector(".requirement-summary:last-of-type")
        ?.textContent ?? window.document.getElementById("main").textContent,
    ).toContain("待更新");
    window.generateRequirementPrototype();
    expect(window.current().prototypeHistory).toHaveLength(2);
    expect(window.current().requirementPrototype.revision).toBe(2);
    window.guideConfirmRequirement();
    expect(window.current().confirmedPrototype.revision).toBe(2);
    expect(window.current().confirmedPrototype.html).toContain(
      "保留异常恢复操作",
    );
    expect(window.document.querySelector(".guide-run-state")).not.toBeNull();
  } finally {
    standalone?.window.close();
    window.close();
  }
});

it("keeps one stable file per requirement and lists newly created requirements first", () => {
  const preview = open("?view=sidebar");
  const window = preview.window;
  let directory;
  try {
    window.guideUpdateGoal("较早需求");
    window.guideSubmit();
    window.generateRequirementPrototype();
    const firstFile = window.current().requirementPrototype.filename;
    expect(window.current().requirementPrototype.relativePath).toBe(
      "docs/prototypes/requirements/" + firstFile,
    );
    window.closeModal();
    const first = window.document.querySelector(
      '[data-task][aria-current="page"]',
    ).dataset.task;
    window.newTask();
    window.guideUpdateGoal("最新需求");
    window.guideSubmit();
    window.generateRequirementPrototype();
    window.closeModal();
    const second = window.document.querySelector(
      '[data-task][aria-current="page"]',
    ).dataset.task;
    expect(window.document.querySelector("[data-task]").dataset.task).toBe(
      second,
    );
    expect(window.requirementCatalog().entries.map((e) => e.title)).toEqual([
      "最新需求",
      "较早需求",
    ]);
    directory = new JSDOM(window.requirementIndexHtml(), {
      url: "https://example.invalid/docs/prototypes/requirements/index.html",
    });
    expect(directory.window.document.querySelector("a").textContent).toBe(
      "最新需求",
    );
    expect(
      directory.window.document.querySelector("a").getAttribute("href"),
    ).toBe("./" + window.current().requirementPrototype.filename);
    window.activateTask(first);
    window.guideUpdateGoal("修改较早需求");
    window.guideSubmit();
    window.generateRequirementPrototype();
    window.closeModal();
    expect(window.current().requirementPrototype.filename).toBe(firstFile);
    expect(window.current().requirementPrototype.revision).toBe(2);
    expect(window.requirementCatalog().entries.map((e) => e.taskId)).toEqual([
      second,
      first,
    ]);
    window.guideChooseScene("mr");
    expect(window.requirementCatalog().entries).toHaveLength(2);
    expect(window.current().requirementPrototype.filename).toBe(firstFile);
  } finally {
    directory?.window.close();
    window.close();
  }
});

it("selects an Agent per task, preserves drafts and scene selection, and uses it in the demo launch", () => {
  const { window } = open("?view=sidebar");
  const document = window.document;
  try {
    const first = document.querySelector('[data-task][aria-current="page"]')
      .dataset.task;
    window.guideUpdateGoal("保留 Agent 选择和需求草稿");
    document.getElementById("task-agent").click();
    expect(document.getElementById("task-agent-menu").hidden).toBe(false);
    document.querySelector('[data-agent="codex"]').click();
    expect(document.getElementById("task-agent").textContent).toContain(
      "Codex",
    );
    expect(document.activeElement).toBe(document.getElementById("task-agent"));
    expect(document.getElementById("task-goal").value).toBe(
      "保留 Agent 选择和需求草稿",
    );
    window.guideChooseScene("bugfix");
    expect(window.current().agent).toBe("codex");
    window.newTask();
    expect(document.getElementById("task-agent").textContent).toContain(
      "项目默认 Agent",
    );
    window.chooseTaskAgent("hermes");
    window.activateTask(first);
    expect(window.current().agent).toBe("codex");
    window.guideSubmit();
    confirmPrototype(window);
    expect(window.taskPrompt()).toContain("任务 Agent：Codex");
    expect(window.current().agent).toBe("codex");
    window.advanceTask(first);
    window.openTaskTerminal();
    expect(document.querySelector("dialog").textContent).toContain(
      "启动 Codex（演示）",
    );
  } finally {
    window.close();
  }
});

it("navigates the Agent menu by keyboard and cancels without changing the selection", () => {
  const { window } = open("?view=sidebar");
  const document = window.document;
  const key = (value) =>
    document.activeElement.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    );
  try {
    document.getElementById("task-agent").focus();
    key("ArrowDown");
    expect(document.activeElement.dataset.agent).toBe("default");
    key("End");
    expect(document.activeElement.dataset.agent).toBe("hermes");
    key("Home");
    key("ArrowDown");
    expect(document.activeElement.dataset.agent).toBe("codex");
    key("Escape");
    expect(document.activeElement.id).toBe("task-agent");
    expect(window.current().agent).toBeUndefined();
    expect(document.getElementById("task-agent-menu").hidden).toBe(true);
    document.getElementById("task-agent").click();
    document.getElementById("task-goal").click();
    expect(document.getElementById("task-agent-menu").hidden).toBe(true);
    expect(window.current().agent).toBeUndefined();
  } finally {
    window.close();
  }
});
