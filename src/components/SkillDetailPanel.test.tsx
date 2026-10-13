// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type {
  ManagedSkill,
  SkillSourceDiffEntry,
  ToolInfo,
} from "../lib/tauri";
import { SkillDetailPanel } from "./SkillDetailPanel";

const api = vi.hoisted(() => ({
  document: vi.fn(),
  source: vi.fn(),
  diff: vi.fn(),
  files: vi.fn(),
  readFile: vi.fn(),
  openVscode: vi.fn(),
}));
vi.mock("../lib/openInVscode", () => ({
  openDirectoryInVscode: api.openVscode,
}));
vi.mock("../lib/tauri", () => ({
  getSkillDocument: api.document,
  getSourceSkillDocument: api.source,
  getSkillSourceDiff: api.diff,
  getSkillFiles: api.files,
  readSkillFile: api.readFile,
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

const skill: ManagedSkill = {
  id: "demo",
  name: "Demo",
  description: "",
  central_path: "<workspace>/library/demo",
  source_type: "local",
  source_ref: "<workspace>/source/demo",
  source_ref_resolved: null,
  source_revision: null,
  remote_revision: null,
  updated_at: 1,
  created_at: 1,
  version: null,
  source_subpath: null,
  source_branch: null,
  source_agent: null,
  last_checked_at: null,
  last_check_error: null,
  enabled: true,
  status: "active",
  targets: [],
  update_status: "up_to_date",
  tags: [],
  skill_group_ids: [],
};

const entry = (
  relative_path: string,
  status: SkillSourceDiffEntry["status"] = "modified",
): SkillSourceDiffEntry => ({
  relative_path,
  status,
  content_kind: "text",
  original_text: "old text",
  updated_text: "new text",
  executable_before: false,
  executable_after: false,
});

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.document.mockResolvedValue({
    skill_id: "demo",
    filename: "SKILL.md",
    content: "Central document",
    central_path: "<workspace>/library/demo",
  });
  api.files.mockResolvedValue([]);
  api.source.mockResolvedValue({
    skill_id: "demo",
    content: "Local source document",
    source_label: "local",
    revision: "workspace",
  });
  api.diff.mockResolvedValue({
    skill_id: "demo",
    source_label: "local",
    revision: "workspace",
    central_path: "<workspace>/library/demo",
    source_path: "<workspace>/source/demo",
    central_version: null,
    source_version: null,
    version_comparison: "unknown",
    entries: [entry("references/changed.md")],
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(
  nextSkill = skill,
  props: Partial<ComponentProps<typeof SkillDetailPanel>> = {},
) {
  await act(async () => {
    root.render(
      <SkillDetailPanel skill={nextSkill} onClose={() => {}} {...props} />,
    );
  });
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find((item) =>
    item.textContent?.trim().startsWith(text),
  );
  expect(button, `Missing button: ${text}`).toBeDefined();
  await act(async () => button?.click());
}

it("switches local and central tabs to their actual documents", async () => {
  await render();
  await click("本地");
  expect(document.querySelector("article")?.textContent).toBe(
    "Local source document",
  );
  await click("中心");
  expect(document.querySelector("article")?.textContent).toBe(
    "Central document",
  );
});

const tool: ToolInfo = {
  key: "claude_code",
  display_name: "Claude Code",
  installed: true,
  enabled: true,
  skills_dir: "<workspace>/agent/skills",
  is_custom: false,
  has_path_override: false,
  project_relative_skills_dir: null,
  has_project_path_override: false,
  category: "coding",
};

it("keeps one interactive agent row below the title and forwards group toggles", async () => {
  const onToggleTool = vi.fn();
  const props = {
    tools: [tool],
    toolToggles: [
      {
        tool: tool.key,
        display_name: tool.display_name,
        installed: true,
        globally_enabled: true,
        enabled: true,
      },
    ],
    onToggleTool,
  };
  await render(skill, props);
  const button = document.querySelector<HTMLButtonElement>(
    '[aria-pressed="true"]',
  );
  expect(button?.getAttribute("aria-label")).toBe("Claude Code · 点击卸载");
  const close = document.querySelector(".lucide-x")?.closest("button");
  expect(close?.parentElement?.parentElement?.querySelector("img")).toBeNull();
  expect(document.querySelectorAll('img[src*="claude"]')).toHaveLength(1);
  await act(async () => button?.click());
  expect(onToggleTool).toHaveBeenCalledWith("claude_code", false);
  await render(skill, { ...props, togglingTool: "claude_code" });
  expect(
    document.querySelector<HTMLButtonElement>('[aria-busy="true"]')?.disabled,
  ).toBe(true);
});

it("supports deployment from all skills without a selected group", async () => {
  const onToggleTarget = vi.fn();
  await render(skill, { tools: [tool], onToggleTarget });
  const button = document.querySelector<HTMLButtonElement>(
    '[aria-label="Claude Code · 点击安装"]',
  );
  expect(button).not.toBeNull();
  await act(async () => button?.click());
  expect(onToggleTarget).toHaveBeenCalledWith("claude_code", true);
});

it("opens the library copy in VS Code through the common launcher", async () => {
  await render();
  await click("在 VS Code 中打开");
  expect(api.openVscode).toHaveBeenCalledWith(skill.central_path);
});

it("loads directory changes before opening the diff tab", async () => {
  api.diff.mockResolvedValueOnce({
    skill_id: "demo",
    source_label: "local",
    revision: "workspace",
    entries: [
      entry("references/changed.md"),
      entry("scripts/new.sh", "added"),
      entry("assets/removed.txt", "removed"),
    ],
  });
  await render();
  expect(api.diff).toHaveBeenCalledWith("demo");
  expect(document.body.textContent).toContain("3 个文件");
  expect(document.body.textContent).toContain("新增 1");
  expect(document.body.textContent).toContain("修改 1");
  expect(document.body.textContent).toContain("删除 1");
});

it("shows file differences even when the main documents are identical", async () => {
  api.source.mockResolvedValueOnce({
    skill_id: "demo",
    content: "Central document",
  });
  await render();
  await click("本地");
  expect(document.body.textContent).toContain("本地来源内容");
  await click("差异");
  expect(document.body.textContent).toContain("references/changed.md");
  expect(document.body.textContent).not.toContain("中心 → 本地");
  expect(document.body.textContent).toContain("文件内容对比");
  expect(document.body.textContent).toContain(
    "<workspace>/library/demo/references/changed.md",
  );
  expect(document.body.textContent).toContain(
    "<workspace>/source/demo/references/changed.md",
  );
  expect(document.body.textContent).toContain("无法确定哪一侧较新");
  const headers = document.querySelectorAll("[data-diff-side]");
  expect(headers[0]?.textContent).toContain("中心库副本");
  expect(headers[1]?.textContent).toContain("本地来源内容");
});

it("refreshes changed local files while preserving the selected tab across metadata updates", async () => {
  await render();
  await click("本地");
  api.source.mockResolvedValue({ skill_id: "demo", content: "Updated source" });
  api.diff.mockResolvedValue({ skill_id: "demo", entries: [] });
  await click("刷新内容");
  expect(document.querySelector("article")?.textContent).toBe("Updated source");
  expect(document.body.textContent).toContain("来源与中心库内容一致");
  await render({ ...skill, updated_at: 2 });
  expect(
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("本地");
});

it("retries failed comparisons and distinguishes errors from no changes", async () => {
  api.diff.mockRejectedValueOnce(new Error("Source unavailable"));
  await render();
  expect(document.body.textContent).not.toContain("来源与中心库内容一致");
  await click("差异");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Source unavailable",
  );
  await click("重试");
  expect(document.body.textContent).toContain("references/changed.md");
});

it("does not clone remote sources before the corresponding tab is opened", async () => {
  await render({ ...skill, source_type: "git" });
  expect(api.source).not.toHaveBeenCalled();
  expect(api.diff).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("尚未比较");
  await click("差异");
  expect(api.diff).toHaveBeenCalledOnce();
  expect(api.source).not.toHaveBeenCalled();
});

it("ignores a stale source response after metadata changes", async () => {
  let resolveOld: (value: unknown) => void = () => {};
  api.source.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await render();
  await click("本地");
  api.source.mockResolvedValue({ skill_id: "demo", content: "Current source" });
  await render({ ...skill, updated_at: 2 });
  await act(async () =>
    resolveOld({ skill_id: "demo", content: "Stale source" }),
  );
  expect(document.querySelector("article")?.textContent).toBe("Current source");
});

it("supports keyboard selection and focus for the content tabs", async () => {
  await render();
  const central = document.querySelector<HTMLButtonElement>(
    '[role="tab"][aria-selected="true"]',
  );
  await act(async () =>
    central?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    ),
  );
  expect(document.activeElement?.textContent).toBe("本地");
  expect(document.querySelector("article")?.textContent).toBe(
    "Local source document",
  );
});

it("keeps the central document usable when the original source is missing", async () => {
  await render({ ...skill, update_status: "source_missing" });
  expect(document.querySelector('[role="tablist"]')).toBeNull();
  expect(document.querySelector("article")?.textContent).toBe(
    "Central document",
  );
  expect(api.source).not.toHaveBeenCalled();
  expect(api.diff).not.toHaveBeenCalled();
});

it("labels a newer declared version beside its directory and marks absent files", async () => {
  api.diff.mockResolvedValueOnce({
    central_path: "<workspace>/library/demo",
    source_path: "<workspace>/source/demo",
    central_version: "1.0.0",
    source_version: "1.1.0",
    version_comparison: "source_newer",
    entries: [entry("scripts/new.sh", "added"), entry("old.md", "removed")],
  });
  await render();
  await click("差异");
  expect(document.body.textContent).toContain("来源的声明版本较新");
  const newer = [...document.querySelectorAll("span")].find(
    (node) => node.textContent === "较新版本",
  );
  expect(newer?.parentElement?.parentElement?.textContent).toContain(
    "<workspace>/source/demo",
  );
  expect(newer?.parentElement?.textContent).toContain("v1.1.0");
  expect(document.body.textContent).toContain("此侧没有该文件");
});

it("does not imply a newer version when declared versions match", async () => {
  api.diff.mockResolvedValueOnce({
    central_path: "<workspace>/library/demo",
    source_path: "<workspace>/source/demo",
    central_version: "1.0.0",
    source_version: "1.0.0",
    version_comparison: "same_version",
    entries: [entry("SKILL.md")],
  });
  await render();
  await click("差异");
  expect(document.body.textContent).toContain("双方声明版本相同");
  expect(document.body.textContent).not.toContain("较新版本");
});
