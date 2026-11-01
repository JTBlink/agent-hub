// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TaskCodeChanges } from "./TaskCodeChanges";
import { makeTaskDevelopment } from "../../../tests/fixtures/repositoryTask";
import { installCodeEditorGeometry } from "../../test/codeEditor";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("opens readable review patches in the shared reader and keeps unavailable patches disabled", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <TaskCodeChanges
        development={makeTaskDevelopment({
          files: [
            {
              path: "src/parser.rs",
              status: "modified",
              additions: 1,
              deletions: 1,
              patch: "@@ -1 +1 @@\n-old\n+new\n",
            },
            {
              path: "image.png",
              status: "added",
              additions: null,
              deletions: null,
              patch: null,
            },
          ],
          commits: [
            {
              sha: "abcdef123456",
              message: "Improve parser",
              author: "demo",
              created_at: null,
              url: "",
            },
          ],
        })}
      />,
    ),
  );
  expect(host.textContent).toContain("Improve parser");
  const files = [...host.querySelectorAll<HTMLButtonElement>("button")];
  expect(
    files.find((button) => button.textContent?.includes("image.png"))?.disabled,
  ).toBe(true);
  await act(async () =>
    files
      .find((button) => button.textContent?.includes("src/parser.rs"))!
      .click(),
  );
  expect(
    document.querySelector("dialog[open] .cm-content")?.textContent,
  ).toContain("+new");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('dialog [aria-label="common.close"]')!
      .click(),
  );
  expect(document.querySelector("dialog")).toBeNull();
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
