// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NewMarkdownDialog } from "./NewMarkdownDialog";
import { modifyWorktreeEntry } from "../../lib/worktreeApi";
vi.mock("../../lib/worktreeApi", async (original) => ({
  ...(await original<typeof import("../../lib/worktreeApi")>()),
  modifyWorktreeEntry: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../GitBrowserDialog", () => ({
  GitBrowserDialog: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}));
it("preserves the filename after a collision and opens only a successfully created Markdown file", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const created = vi.fn(),
    close = vi.fn();
  vi.mocked(modifyWorktreeEntry)
    .mockRejectedValueOnce(new Error("File exists"))
    .mockResolvedValueOnce("notes.md");
  try {
    await act(async () =>
      root.render(
        <NewMarkdownDialog
          projectId="demo"
          worktreePath="/projects/demo"
          onCreated={created}
          onClose={close}
        />,
      ),
    );
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "notes");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = () =>
      act(async () => {
        host
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
    await submit();
    expect(input.value).toBe("notes");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "File exists",
    );
    expect(created).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await submit();
    expect(modifyWorktreeEntry).toHaveBeenLastCalledWith(
      "demo",
      "/projects/demo",
      "",
      { kind: "new_file", name: "notes.md" },
    );
    expect(created).toHaveBeenCalledWith("notes.md");
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
