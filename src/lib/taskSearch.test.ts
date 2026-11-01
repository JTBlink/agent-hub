import { expect, it } from "vitest";
import type { TaskFilters } from "./taskBrowserApi";
import {
  changeTaskFilters,
  serializeTaskFilters,
  taskSearchFilters,
} from "./taskSearch";
import {
  readTaskViewPreferences,
  saveTaskViewPreferences,
} from "./taskViewPreferences";

const defaults: TaskFilters = {
  kind: "issue",
  state: "open",
  personal: "all",
  text: "",
};

it("generates the visible query from menu options and round-trips quoted labels", () => {
  expect(serializeTaskFilters(defaults)).toBe("is:issue is:open");
  const filters: TaskFilters = {
    ...defaults,
    state: "closed",
    author: "@me",
    assignee: "reviewer",
    labels: ["needs review", 'with "quotes"'],
    text: "parser",
  };
  const query = serializeTaskFilters(filters);
  expect(query).toContain(
    'is:closed author:@me assignee:reviewer label:"needs review"',
  );
  expect(taskSearchFilters({ ...defaults, text: query })).toEqual(filters);
});

it("combines scope, state, author, assignee, quoted labels and remaining text", () => {
  expect(
    taskSearchFilters({
      ...defaults,
      text: 'is:issue is:closed author:contributor assignee:@me label:"needs review" label:bug label:bug parser',
    }),
  ).toEqual({
    ...defaults,
    state: "closed",
    author: "contributor",
    assignee: "@me",
    labels: ["needs review", "bug"],
    text: "parser",
  });
});

it.each(["is:pr is:merged", "is:mr state:merged", "is:draft"])(
  "uses the review endpoint for %s",
  (text) => {
    const filters = taskSearchFilters({ ...defaults, text });
    expect(filters.kind).toBe("review");
    expect(filters.state).toBe(text === "is:draft" ? "draft" : "merged");
  },
);

it("resolves escaped label values and leaves literal text and unknown qualifiers intact", () => {
  expect(
    taskSearchFilters({
      ...defaults,
      text: 'label:"needs \\"review\\"" repo:other/project "exact phrase"',
    }),
  ).toMatchObject({
    labels: ['needs "review"'],
    text: 'repo:other/project "exact phrase"',
  });
});

it("a control change overrides existing query qualifiers and preserves other filters", () => {
  expect(
    changeTaskFilters(
      { ...defaults, text: "is:closed author:@me label:bug parser" },
      { state: "all" },
    ),
  ).toEqual({
    ...defaults,
    state: "all",
    author: "@me",
    labels: ["bug"],
    text: "parser",
  });
  expect(
    changeTaskFilters(
      { ...defaults, kind: "review", state: "merged" },
      { kind: "issue" },
    ).state,
  ).toBe("open");
});

it("does not discard an explicitly selected account when leaving a personal preset", () => {
  expect(
    changeTaskFilters(
      { ...defaults, personal: "assigned" },
      { author: "contributor", personal: "all" },
    ),
  ).toMatchObject({ author: "contributor", personal: "all" });
  expect(
    changeTaskFilters(
      { ...defaults, author: "contributor", assignee: "reviewer" },
      { personal: "assigned" },
    ),
  ).toMatchObject({
    author: undefined,
    assignee: undefined,
    personal: "assigned",
  });
});

it("retains new filters in view preferences while accepting older saved preferences", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    const filters: TaskFilters = {
      ...defaults,
      kind: "review",
      state: "draft",
      author: "@me",
      assignee: "reviewer",
      labels: ["bug"],
    };
    saveTaskViewPreferences({ provider: "all", projectId: "all", filters });
    expect(readTaskViewPreferences().filters).toEqual(filters);
    saveTaskViewPreferences({
      provider: "all",
      projectId: "all",
      filters: defaults,
    });
    expect(readTaskViewPreferences().filters).toMatchObject(defaults);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
