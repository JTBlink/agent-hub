// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { TaskFilters } from "../../lib/taskBrowserApi";
import { changeTaskFilters } from "../../lib/taskSearch";
import {
  makeRepositoryTask,
  makeTaskMetadata,
} from "../../../tests/fixtures/repositoryTask";
import { TaskAttributeFilters } from "./TaskAttributeFilters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("combines author, assignee and multiple labels, removes one filter, and clears all", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const changes = vi.fn();
  const task = makeRepositoryTask({
    metadata: makeTaskMetadata({
      author: "contributor",
      labels: ["bug", "needs review"],
    }),
    assignees: ["reviewer"],
  });
  function Harness() {
    const [filters, setFilters] = useState<TaskFilters>({
      kind: "issue",
      state: "closed",
      personal: "all",
      text: "",
    });
    return (
      <TaskAttributeFilters
        filters={filters}
        items={[task]}
        onChange={(patch) =>
          setFilters((previous) => {
            const next = changeTaskFilters(previous, patch);
            changes(next);
            return next;
          })
        }
      />
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const click = async (text: string, scope: ParentNode = document) => {
    const button = [
      ...scope.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (button) =>
        button.textContent === text ||
        button.getAttribute("aria-label") === text,
    );
    expect(button, text).toBeDefined();
    await act(async () => button!.click());
  };
  const section = async (name: string) => {
    await click("tasks.filters");
    await click(name, document.querySelector('[role="menu"]')!);
  };
  try {
    await act(async () => root.render(<Harness />));
    await section("tasks.facts.author");
    await click("contributor");
    await section("tasks.assignee");
    await click("reviewer");
    await section("tasks.facts.labels");
    await click("bug");
    await click("needs review");
    expect(changes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "closed",
        author: "contributor",
        assignee: "reviewer",
        labels: ["bug", "needs review"],
      }),
    );
    await click("bug", document.querySelector('[role="dialog"]')!);
    expect(changes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        labels: ["needs review"],
        author: "contributor",
      }),
    );
    await click("common.close", document.querySelector('[role="dialog"]')!);
    await click("tasks.filters");
    await click("tasks.clearFilters", document.querySelector('[role="menu"]')!);
    expect(changes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "open",
        author: "",
        assignee: "",
        labels: [],
      }),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
