// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GitChanges } from "./GitChanges";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("applies directory actions only to descendants without toggling the folder", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onStage = vi.fn(),
    onDiscard = vi.fn();
  const files = ["src/one.ts", "src/nested/two.ts", "docs/readme.md"].map(
    (path) => ({
      path,
      staged: false,
      unstaged: true,
      conflicted: false,
      status: "modified",
    }),
  );
  files.push({
    path: "docs/deleted.md",
    staged: false,
    unstaged: true,
    conflicted: false,
    status: "deleted",
  });
  const render = (staged = false, batchLimited = false) =>
    root.render(
      <GitChanges
        files={files}
        staged={staged}
        busy={false}
        batchLimited={batchLimited}
        onSelect={vi.fn()}
        onStage={onStage}
        onDiscard={onDiscard}
      />,
    );
  await act(async () => render());
  expect(
    host
      .querySelector<HTMLButtonElement>('button[title="docs/deleted.md"]')
      ?.classList.contains("text-danger"),
  ).toBe(true);
  const button = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const folder = host.querySelector('summary[title="src"]')!.parentElement!;
  await act(async () => button("git.stageDirectory: src").click());
  expect(onStage).toHaveBeenLastCalledWith(
    ["src/nested/two.ts", "src/one.ts"],
    true,
  );
  expect(folder.hasAttribute("open")).toBe(true);
  await act(async () => button("git.discardChanges: src/nested").click());
  expect(onDiscard).toHaveBeenLastCalledWith(["src/nested/two.ts"]);
  await act(async () => render(true));
  expect(
    host.querySelector('[aria-label="git.discardChanges: src"]'),
  ).toBeNull();
  await act(async () => button("git.unstageDirectory: src").click());
  expect(onStage).toHaveBeenLastCalledWith(
    ["src/nested/two.ts", "src/one.ts"],
    false,
  );
  await act(async () => render(false, true));
  expect(button("git.stageDirectory: src").disabled).toBe(true);
  expect(button("git.discardChanges: src").disabled).toBe(true);
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
