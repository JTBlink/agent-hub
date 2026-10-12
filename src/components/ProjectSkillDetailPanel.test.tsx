// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ProjectSkillEntry } from "../lib/projectSkillEntries";
import { ProjectSkillDetailPanel } from "./ProjectSkillDetailPanel";

const api = vi.hoisted(() => ({
  diff: vi.fn(),
  local: vi.fn(),
  central: vi.fn(),
}));
vi.mock("../lib/tauri", () => ({
  getProjectSkillDiff: api.diff,
  getProjectSkillDocument: api.local,
  getSkillDocument: api.central,
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
const variant = {
  name: "Demo",
  dir_name: "demo",
  relative_path: "demo",
  description: null,
  path: "<workspace>/project/.claude/skills/demo",
  files: ["SKILL.md"],
  enabled: true,
  agent: "claude_code",
  agent_display_name: "Claude Code",
  tags: [],
  in_center: true,
  sync_status: "project_newer" as const,
  center_skill_id: "center-z",
};
const skill: ProjectSkillEntry = {
  id: "demo",
  name: "Demo",
  dir_name: "demo",
  relative_path: "demo",
  description: null,
  files: ["SKILL.md"],
  variants: [variant],
  enabledCount: 1,
  totalCount: 1,
  primaryVariant: variant,
  status: "project_newer",
  tags: [],
  centerSkillIds: ["center-a", "center-z"],
};
const diff = {
  central_path: "<workspace>/library/demo",
  source_path: variant.path,
  central_version: "1.0.0",
  source_version: "1.1.0",
  version_comparison: "source_newer",
  entries: [
    {
      relative_path: "references/changed.md",
      status: "modified",
      content_kind: "text",
      original_text: "center reference",
      updated_text: "project reference",
      executable_before: false,
      executable_after: false,
    },
  ],
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.diff.mockResolvedValue(diff);
  api.local.mockResolvedValue({ content: "Same main document" });
  api.central.mockResolvedValue({ content: "Same main document" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(nextSkill = skill, syncProps = {}) {
  const props = {
    projectId: "project-demo",
    skill: nextSkill,
    targets: [],
    togglingAgent: null,
    onToggleAgent: () => {},
    updatingCenter: false,
    updatingProject: false,
    onUpdateCenter: vi.fn(),
    onUpdateProject: vi.fn(),
    onClose: () => {},
    ...syncProps,
  };
  await act(async () => root.render(<ProjectSkillDetailPanel {...props} />));
}

function syncButton(key: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.getAttribute("aria-label") === i18n.t(key),
  );
}

it("shows card sync actions beside the detail title and forwards both operations", async () => {
  const onUpdateCenter = vi.fn();
  const onUpdateProject = vi.fn();
  await render(skill, { onUpdateCenter, onUpdateProject });
  const upload = syncButton("project.updateCenter");
  const restore = syncButton("project.resetFromCenter");
  expect(
    upload?.parentElement?.parentElement?.querySelector("h2")?.textContent,
  ).toBe("Demo");
  expect(upload?.className).toContain("text-accent-light");
  expect(restore?.className).not.toContain("text-accent-light");
  await act(async () => {
    upload?.click();
    restore?.click();
  });
  expect(onUpdateCenter).toHaveBeenCalledOnce();
  expect(onUpdateProject).toHaveBeenCalledOnce();
});

it.each(["updatingCenter", "updatingProject"])(
  "blocks both detail sync actions while %s",
  async (busyProp) => {
    const onUpdateCenter = vi.fn();
    const onUpdateProject = vi.fn();
    await render(skill, { [busyProp]: true, onUpdateCenter, onUpdateProject });
    const upload = syncButton("project.updateCenter");
    const restore = syncButton("project.resetFromCenter");
    expect(upload?.disabled).toBe(true);
    expect(restore?.disabled).toBe(true);
    await act(async () => {
      upload?.click();
      restore?.click();
    });
    expect(onUpdateCenter).not.toHaveBeenCalled();
    expect(onUpdateProject).not.toHaveBeenCalled();
  },
);

it("refreshes the open detail after sync and removes completed actions", async () => {
  await render();
  expect(syncButton("project.updateCenter")).toBeDefined();
  const syncedVariant = { ...variant, sync_status: "in_sync" as const };
  api.local.mockResolvedValue({ content: "Restored project content" });
  await render({
    ...skill,
    status: "in_sync",
    primaryVariant: syncedVariant,
    variants: [syncedVariant],
  });
  expect(syncButton("project.updateCenter")).toBeUndefined();
  expect(syncButton("project.resetFromCenter")).toBeUndefined();
  expect(document.body.textContent).toContain("Restored project content");
  expect(document.querySelector("h2")?.textContent).toBe("Demo");
});

it("uses the card's whole-skill status even while viewing a different Agent copy", async () => {
  const synced = { ...variant, sync_status: "in_sync" as const };
  const newerCenter = {
    ...variant,
    agent: "codex",
    agent_display_name: "Codex",
    sync_status: "center_newer" as const,
  };
  await render({
    ...skill,
    status: "center_newer",
    primaryVariant: synced,
    variants: [synced, newerCenter],
  });
  const pull = syncButton("project.updateProject");
  expect(pull?.className).toContain("text-accent-light");
  expect(syncButton("project.updateCenter")).toBeUndefined();
  const select = document.querySelector("select");
  expect(select?.value).toBe("claude_code");
  await act(async () => {
    if (select) {
      select.value = "codex";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  expect(syncButton("project.updateProject")?.className).toContain(
    "text-accent-light",
  );
});
async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find((node) =>
    node.textContent?.trim().startsWith(label),
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
}
it("shows project directory differences even when SKILL.md matches the center", async () => {
  await render();
  await click("差异");
  expect(document.body.textContent).toContain("references/changed.md");
  expect(document.body.textContent).toContain("project reference");
  expect(document.body.textContent).toContain(
    `${variant.path}/references/changed.md`,
  );
  expect(document.body.textContent).toContain("较新版本");
  expect(api.diff).toHaveBeenCalledWith("project-demo", "demo", "claude_code");
});
it("loads the center that belongs to the displayed project variant", async () => {
  await render();
  await click("中心");
  expect(api.central).toHaveBeenCalledWith("center-z");
});

it("opens the newer project variant instead of the first alphabetic copy", async () => {
  const older = {
    ...variant,
    agent: "codex",
    agent_display_name: "Codex",
    path: "<workspace>/project/.codex/skills/demo",
    sync_status: "in_sync" as const,
    center_skill_id: "center-a",
  };
  await render({ ...skill, primaryVariant: older, variants: [older, variant] });
  expect(document.body.textContent).toContain("项目较新");
  expect(api.diff).toHaveBeenCalledWith("project-demo", "demo", "claude_code");
});

it("ignores old comparison responses when switching project Agent copies", async () => {
  let resolveOld: (data: unknown) => void = () => {};
  api.diff.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const other = {
    ...variant,
    agent: "codex",
    agent_display_name: "Codex",
    path: "<workspace>/project/.codex/skills/demo",
    sync_status: "center_newer" as const,
    center_skill_id: "center-a",
  };
  await render({ ...skill, variants: [variant, other] });
  await click("差异");
  api.diff.mockResolvedValue({
    ...diff,
    source_path: other.path,
    entries: [
      {
        ...diff.entries[0],
        relative_path: "current.md",
        updated_text: "current copy",
      },
    ],
  });
  const select = document.querySelector("select");
  await act(async () => {
    if (select) {
      select.value = "codex";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await act(async () => resolveOld(diff));
  expect(api.diff).toHaveBeenLastCalledWith("project-demo", "demo", "codex");
  expect(document.body.textContent).toContain("current.md");
  expect(document.body.textContent).not.toContain("references/changed.md");
});

it("keeps comparison errors distinct from no changes and allows retry", async () => {
  api.diff.mockRejectedValueOnce(new Error("Comparison failed"));
  await render();
  await click("差异");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Comparison failed",
  );
  expect(document.body.textContent).not.toContain("无差异");
  await click("重试");
  expect(document.body.textContent).toContain("references/changed.md");
});

it("places the project copy on the left and the matched library copy on the right", async () => {
  await render();
  await click("差异");
  const headers = document.querySelectorAll("[data-diff-side]");
  expect(headers[0]?.textContent).toContain("项目副本");
  expect(headers[0]?.textContent).toContain(
    `${variant.path}/references/changed.md`,
  );
  expect(headers[1]?.textContent).toContain("中心库副本");
  expect(headers[1]?.textContent).toContain(
    "<workspace>/library/demo/references/changed.md",
  );
  const left = [...document.querySelectorAll("td:nth-child(2)")]
    .map((cell) => cell.textContent)
    .join("");
  const right = [...document.querySelectorAll("td:nth-child(4)")]
    .map((cell) => cell.textContent)
    .join("");
  expect(left).toContain("project reference");
  expect(left).not.toContain("center reference");
  expect(right).toContain("center reference");
  expect(right).not.toContain("project reference");
});

it("counts a project-only file as a local addition relative to the library", async () => {
  api.diff.mockResolvedValueOnce({
    ...diff,
    entries: [
      {
        ...diff.entries[0],
        status: "added",
        original_text: null,
        updated_text: "project-only content",
      },
    ],
  });
  await render();
  await click("差异");
  expect(document.body.textContent).toContain("新增 1");
  expect(document.body.textContent).toContain("删除 0");
  const headers = document.querySelectorAll("[data-diff-side]");
  expect(headers[0]?.textContent).not.toContain("此侧没有该文件");
  expect(headers[1]?.textContent).toContain("此侧没有该文件");
});

it("marks lines added locally with a green plus on the left", async () => {
  api.diff.mockResolvedValueOnce({
    ...diff,
    entries: [
      {
        ...diff.entries[0],
        original_text: "name: demo",
        updated_text: "name: demo\nlicense: MIT",
      },
    ],
  });
  await render();
  await click("差异");
  const cell = [...document.querySelectorAll("td:nth-child(2)")].find((node) =>
    node.textContent?.includes("license: MIT"),
  );
  expect(cell?.textContent).toContain("+");
  expect(cell?.className).toContain("bg-[#dafbe1]");
  expect(document.body.textContent).toContain("@@ +");
});

it("marks lines deleted locally with a red minus on the right", async () => {
  api.diff.mockResolvedValueOnce({
    ...diff,
    entries: [
      {
        ...diff.entries[0],
        original_text: "name: demo\nold content",
        updated_text: "name: demo",
      },
    ],
  });
  await render();
  await click("差异");
  const cell = [...document.querySelectorAll("td:nth-child(4)")].find((node) =>
    node.textContent?.includes("old content"),
  );
  expect(cell?.textContent).toContain("-");
  expect(cell?.className).toContain("bg-[#ffebe9]");
});

it("counts a center-only file as deleted locally and keeps it on the right", async () => {
  api.diff.mockResolvedValueOnce({
    ...diff,
    entries: [
      {
        ...diff.entries[0],
        status: "removed",
        original_text: "center-only content",
        updated_text: null,
      },
    ],
  });
  await render();
  await click("差异");
  expect(document.body.textContent).toContain("新增 0");
  expect(document.body.textContent).toContain("删除 1");
  const headers = document.querySelectorAll("[data-diff-side]");
  expect(headers[0]?.textContent).toContain("此侧没有该文件");
  expect(headers[1]?.textContent).not.toContain("此侧没有该文件");
  const right = [...document.querySelectorAll("td:nth-child(4)")].find((node) =>
    node.textContent?.includes("center-only content"),
  );
  expect(right?.textContent).toContain("-");
  expect(right?.className).toContain("bg-[#ffebe9]");
});
