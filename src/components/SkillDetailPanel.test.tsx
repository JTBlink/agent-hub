// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ManagedSkill, SkillSourceDiffEntry } from "../lib/tauri";
import { SkillDetailPanel } from "./SkillDetailPanel";

const api = vi.hoisted(() => ({
  document: vi.fn(),
  source: vi.fn(),
  diff: vi.fn(),
}));
vi.mock("../lib/tauri", () => ({
  getSkillDocument: api.document,
  getSourceSkillDocument: api.source,
  getSkillSourceDiff: api.diff,
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
    content: "Central document",
  });
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

async function render(nextSkill = skill) {
  await act(async () => {
    root.render(<SkillDetailPanel skill={nextSkill} onClose={() => {}} />);
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
  expect(document.body.textContent).toContain("中心 → 本地");
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
