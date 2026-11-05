// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  WorkspaceFilesContext,
  type WorkspaceFiles,
} from "../../hooks/useWorkspaceFiles";
import { WorktreePreviewsContext } from "../../hooks/worktreePreviewsContext";
import { WorktreeOpenEditors } from "./WorktreeOpenEditors";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./WorktreeFileCloseButton", () => ({
  WorktreeFileCloseButton: ({ onClose }: { onClose: () => void }) => (
    <button aria-label="close source" onClick={onClose} />
  ),
}));

it("lists checkout editors, restores a hidden source, collapses and closes it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  const scope = JSON.stringify(["demo", "<workspace>"]);
  function Harness() {
    const [files, setFiles] = useState<WorkspaceFiles>({
      [scope]: { path: "src/main.ts", shown: false },
    });
    return (
      <WorkspaceFilesContext.Provider
        value={{ files, setFiles, setCheckout: vi.fn() }}
      >
        <WorktreePreviewsContext.Provider
          value={{
            tabs: [],
            selected: null,
            select,
            open: vi.fn(),
            close: vi.fn(),
            registerClose: vi.fn(),
          }}
        >
          <WorktreeOpenEditors projectId="demo" worktreePath="<workspace>" />
        </WorktreePreviewsContext.Provider>
      </WorkspaceFilesContext.Provider>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const source = () =>
      host.querySelector<HTMLButtonElement>('[title="src/main.ts"]')!;
    expect(source().getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).toContain("src");
    await act(async () => source().click());
    expect(source().getAttribute("aria-pressed")).toBe("true");
    expect(select).toHaveBeenCalledWith(null);
    const heading = host.querySelector<HTMLButtonElement>("[aria-expanded]")!;
    await act(async () => heading.click());
    expect(source()).toBeNull();
    await act(async () => heading.click());
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="close source"]')!
        .click(),
    );
    expect(host.textContent).toBe("");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
