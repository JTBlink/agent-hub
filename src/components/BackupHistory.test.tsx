// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import zh from "../i18n/zh.json";
import { BackupHistory } from "./BackupHistory";
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
it("shows recent backup commits alongside snapshots and restores using their exact references", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onRestore = vi.fn();
  const commit = "a".repeat(40);
  const versions = [
    {
      tag: commit,
      commit: "aaaaaaaa",
      message: "auto backup",
      author: "Device A",
      committed_at: "2026-10-28T04:17:35Z",
    },
    {
      tag: "sm-v-20261023-084246-789ef92",
      commit: "789ef924",
      message: "manual sync",
      author: "Device B",
      committed_at: "2026-10-23T08:42:45Z",
    },
  ];
  try {
    await act(async () =>
      root.render(
        <BackupHistory
          versions={versions}
          loading={false}
          isRepo
          restoring={null}
          onRefresh={() => {}}
          onRestore={onRestore}
        />,
      ),
    );
    expect(container.textContent).toContain("历史版本");
    expect(container.textContent).toContain("备份：");
    expect(container.textContent).toContain("快照：");
    expect(container.textContent).not.toContain(commit);
    const buttons = [...container.querySelectorAll("button")].filter(
      (button) => button.textContent === "恢复",
    );
    await act(async () => buttons[0].click());
    expect(onRestore).toHaveBeenCalledWith(commit);
    await act(async () => buttons[1].click());
    expect(onRestore).toHaveBeenLastCalledWith(versions[1].tag);
    await act(async () =>
      root.render(
        <BackupHistory
          versions={versions}
          loading={false}
          isRepo
          restoring={commit}
          onRefresh={() => {}}
          onRestore={onRestore}
        />,
      ),
    );
    expect(
      [...container.querySelectorAll("button")]
        .filter((button) => button.textContent !== "重新检测")
        .every((button) => button.disabled),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
