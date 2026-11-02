// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import zh from "../../i18n/zh.json";
import { GitGraphTable } from "./GitGraphTable";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}));

it("copies tag, grouped branch and commit information without selecting a row", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(writeText).mockResolvedValue(undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  const sha = "abcdef".repeat(6) + "abcd";
  const tag = "archive/ci-mirror-playwright-1.64.1";
  const summary = "Preserve complete reference names";
  const open = async (target: Element) =>
    act(async () => {
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        }),
      );
    });
  const choose = async (label: string) =>
    act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          `[role="menuitem"][title="${label}"]`,
        )!
        .click();
    });
  try {
    await act(async () =>
      root.render(
        <GitGraphTable
          commits={[
            {
              sha,
              summary,
              author: "Example",
              time: 0,
              parents: [],
              refs: [
                { name: tag, kind: "tag", remote: false },
                { name: "main", remote: false },
                { name: "origin/main", remote: true, remote_name: "origin" },
              ],
            },
          ]}
          changedFiles={0}
          query=""
          loading={false}
          onSelect={select}
        />,
      ),
    );
    const badge = host.querySelector('[data-graph-ref="tag"]')!;
    await open(badge);
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    await choose("复制标签名");
    expect(writeText).toHaveBeenLastCalledWith(tag);
    expect(select).not.toHaveBeenCalled();
    await open(host.querySelector('[data-graph-ref="branch"]')!);
    await choose("复制分支名: origin/main");
    expect(writeText).toHaveBeenLastCalledWith("origin/main");
    const row = host.querySelector('[data-commit-index="0"]')!;
    await open(row);
    await choose("复制提交说明");
    expect(writeText).toHaveBeenLastCalledWith(summary);
    await open(row);
    await choose("复制提交 SHA");
    expect(writeText).toHaveBeenLastCalledWith(sha);
    expect(select).not.toHaveBeenCalled();
    await open(badge);
    await choose("查看详情");
    expect(select).toHaveBeenCalledExactlyOnceWith(sha);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
