import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillTargetConflictDialog } from "./SkillTargetConflictDialog";

const mocks = vi.hoisted(() => {
  const callbacks: { confirm?: () => Promise<void | false> } = {};
  return { callbacks, sync: vi.fn(), success: vi.fn(), error: vi.fn() };
});
vi.mock("../lib/tauri", () => ({ syncSkillToTool: mocks.sync }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./ConfirmDialog", () => ({
  ConfirmDialog: ({
    onConfirm,
  }: {
    onConfirm: () => Promise<void | false>;
  }) => {
    mocks.callbacks.confirm = onConfirm;
    return null;
  },
}));

function renderDialog(onInstalled: () => Promise<void>) {
  renderToStaticMarkup(
    createElement(SkillTargetConflictDialog, {
      conflict: {
        skillId: "demo",
        tool: "test_agent",
        displayName: "Test Agent",
        conflicts: [],
      },
      skillName: "Demo",
      onClose: vi.fn(),
      onInstalled,
    }),
  );
  const confirm = mocks.callbacks.confirm;
  if (!confirm) throw new Error("Dialog did not expose a confirm action");
  return confirm;
}

describe("skill target overwrite confirmation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a rejected deployment and keeps the dialog open", async () => {
    mocks.sync.mockRejectedValueOnce({
      kind: "io",
      message: "Permission denied",
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    expect(await renderDialog(refresh)()).toBe(false);
    expect(mocks.sync).toHaveBeenCalledWith("demo", "test_agent", true);
    expect(mocks.error).toHaveBeenCalledWith("Permission denied");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes installed skills before reporting success and closing", async () => {
    mocks.sync.mockResolvedValueOnce(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    expect(await renderDialog(refresh)()).toBeUndefined();
    expect(refresh).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledWith("mySkills.targetInstalled");
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
