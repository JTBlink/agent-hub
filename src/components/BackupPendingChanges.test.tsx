// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { GitBackupChange } from "../lib/tauri";
import { BackupPendingChanges } from "./BackupPendingChanges";

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(changes: GitBackupChange[]) {
  await act(async () =>
    root.render(<BackupPendingChanges changes={changes} />),
  );
}

it("shows full file paths and change kinds including both rename paths", async () => {
  await render([
    { path: "skills/新 技能/说明.md", previous_path: null, kind: "added" },
    { path: "skills/demo/SKILL.md", previous_path: null, kind: "modified" },
    { path: "skills/deleted/SKILL.md", previous_path: null, kind: "deleted" },
    {
      path: "skills/new/SKILL.md",
      previous_path: "skills/old/SKILL.md",
      kind: "renamed",
    },
    { path: ".agent-hub/state.json", previous_path: null, kind: "conflicted" },
  ]);
  const list = container.querySelector("ul");
  expect(list?.getAttribute("aria-label")).toBe("未备份的文件（5）");
  expect(list?.tabIndex).toBe(0);
  const rows = Array.from(
    container.querySelectorAll("li"),
    (row) => row.textContent,
  );
  expect(rows).toEqual([
    "skills/新 技能/说明.md新增",
    "skills/demo/SKILL.md修改",
    "skills/deleted/SKILL.md删除",
    "skills/old/SKILL.md → skills/new/SKILL.md重命名",
    ".agent-hub/state.json冲突",
  ]);
});

it("keeps every file visible in a long list and removes the list when backed up", async () => {
  const changes: GitBackupChange[] = Array.from(
    { length: 150 },
    (_, index) => ({
      path: `skills/demo/file-${index}.md`,
      previous_path: null,
      kind: "modified",
    }),
  );
  await render(changes);
  expect(container.querySelectorAll("li")).toHaveLength(150);
  expect(container.textContent).toContain("file-149.md");
  await render([]);
  expect(container.textContent).toBe("");
  expect(container.querySelector("ul")).toBeNull();
});
