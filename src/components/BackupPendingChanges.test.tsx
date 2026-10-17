// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
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
    root.render(
      <MemoryRouter>
        <BackupPendingChanges changes={changes} />
      </MemoryRouter>,
    ),
  );
}

it("shows a diff button with file count when there are unbackuped changes", async () => {
  await render([
    { path: "skills/demo/SKILL.md", previous_path: null, kind: "modified" },
    { path: "skills/new/SKILL.md", previous_path: null, kind: "added" },
  ]);
  const button = container.querySelector("button");
  expect(button).not.toBeNull();
  expect(container.textContent).toContain("待上传的文件（2）");
  expect(button?.textContent).toContain("查看差异");
});

it("renders nothing when there are no changes", async () => {
  await render([]);
  expect(container.textContent).toBe("");
  expect(container.querySelector("button")).toBeNull();
});

it("shows file paths, change kinds and rename origins directly on the backup card", async () => {
  await render([
    {
      path: ".agent-hub/skills/demo.json",
      previous_path: null,
      kind: "modified",
    },
    {
      path: "skills/新名称/SKILL.md",
      previous_path: "skills/旧名称/SKILL.md",
      kind: "renamed",
    },
  ]);
  expect(container.textContent).toContain(".agent-hub/skills/demo.json");
  expect(container.textContent).toContain("修改");
  expect(container.textContent).toContain("skills/新名称/SKILL.md");
  expect(container.textContent).toContain("skills/旧名称/SKILL.md");
  expect(container.textContent).toContain("重命名");
});
