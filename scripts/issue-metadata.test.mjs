import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  closingCommitIncluded,
  issueLabels,
  runEvent,
  syncIssue,
  syncRelease,
  targetVersion,
} from "./issue-metadata.mjs";

function issue(overrides = {}) {
  return {
    number: 42,
    state: "open",
    state_reason: null,
    body: "",
    labels: [{ name: "bug" }],
    milestone: null,
    ...overrides,
  };
}
function fakeApi(milestones = []) {
  const items = [...milestones];
  return {
    listMilestones: vi.fn(async () => items),
    request: vi.fn(async (method, path, payload) => {
      if (method === "POST" && path === "/milestones")
        return { ...payload, number: items.length + 1 };
      return payload;
    }),
    paginate: vi.fn(async () => []),
  };
}

describe("Issue metadata", () => {
  it("reads only a complete version field, without evaluating issue body text", () => {
    expect(targetVersion("Target version: v0.1.12")).toBe("v0.1.12");
    expect(targetVersion("目标版本：`v0.2.0`")).toBe("v0.2.0");
    expect(targetVersion("Target version: v1.2.3; echo unsafe")).toBeNull();
    expect(targetVersion("Example Target version: v1.2.3")).toBeNull();
  });

  it("clears actionable labels on completion while preserving product labels", () => {
    expect(
      issueLabels(
        issue({
          state: "closed",
          state_reason: "completed",
          labels: ["bug", "ready-for-agent", "needs-info", "wontfix"],
        }),
      ),
    ).toEqual(["bug"]);
    expect(
      issueLabels(
        issue({
          state: "closed",
          state_reason: "not_planned",
          labels: ["bug", "needs-triage"],
        }),
      ),
    ).toEqual(["bug", "wontfix"]);
    expect(issueLabels(issue({ labels: ["bug", "wontfix"] }))).toEqual([
      "bug",
      "needs-triage",
    ]);
  });

  it("assigns Unreleased to a new issue and creates it when needed", async () => {
    const api = fakeApi();
    await syncIssue(api, issue());
    expect(api.request).toHaveBeenCalledWith(
      "POST",
      "/milestones",
      expect.objectContaining({ title: "Unreleased", state: "open" }),
    );
    expect(api.request).toHaveBeenCalledWith("PATCH", "/issues/42", {
      labels: ["bug", "needs-triage"],
      milestone: 1,
    });
  });

  it("preserves a manual milestone until the explicit target version changes", async () => {
    const current = issue({
      body: "Target version: Unreleased",
      labels: ["needs-triage"],
      milestone: { number: 8 },
    });
    const api = fakeApi([{ title: "v0.2.0", number: 9 }]);
    await syncIssue(api, current);
    expect(api.request).not.toHaveBeenCalled();
    await syncIssue(
      api,
      { ...current, body: "Target version: v0.2.0" },
      current.body,
    );
    expect(api.request).toHaveBeenCalledWith("PATCH", "/issues/42", {
      milestone: 9,
    });
  });

  it("does not change an already synchronized issue or a pull request", async () => {
    const api = fakeApi();
    await syncIssue(
      api,
      issue({ labels: ["ready-for-agent"], milestone: { number: 3 } }),
    );
    await syncIssue(api, issue({ pull_request: {} }));
    expect(api.request).not.toHaveBeenCalled();
  });

  it("uses the most recent closure and refuses missing or unrelated commit evidence", async () => {
    const api = fakeApi();
    api.paginate.mockResolvedValue([
      { event: "closed", commit_id: "older" },
      { event: "reopened" },
      { event: "closed", commit_id: "final" },
    ]);
    api.request.mockResolvedValue({ status: "ahead" });
    expect(await closingCommitIncluded(api, issue(), "v0.1.12")).toBe(true);
    expect(api.request).toHaveBeenCalledWith(
      "GET",
      "/compare/final...v0.1.12",
      undefined,
      [404],
    );
    api.request.mockResolvedValue({ status: "diverged" });
    expect(await closingCommitIncluded(api, issue(), "v0.1.12")).toBe(false);
    api.paginate.mockResolvedValue([{ event: "closed", commit_id: null }]);
    expect(await closingCommitIncluded(api, issue(), "v0.1.12")).toBe(false);
  });

  it("archives only delivered work and returns unfinished release work to Unreleased", async () => {
    const api = fakeApi([
      { title: "v0.1.12", number: 12, state: "open" },
      { title: "Unreleased", number: 13, state: "open" },
    ]);
    api.request.mockImplementation(async (method, path, payload) => {
      if (path.startsWith("/compare/")) return { status: "identical" };
      return { number: 12, ...payload };
    });
    api.paginate.mockImplementation(async (path) => {
      if (path === "/issues?state=open&milestone=12")
        return [issue({ number: 5, labels: ["needs-info"] })];
      if (path === "/issues?state=closed&milestone=13")
        return [
          issue({ number: 6, state: "closed", state_reason: "completed" }),
          issue({ number: 7, state: "closed" }),
        ];
      if (path === "/issues/6/events")
        return [{ event: "closed", commit_id: "delivered" }];
      return [];
    });
    await syncRelease(api, "v0.1.12");
    expect(api.request).toHaveBeenCalledWith("PATCH", "/milestones/12", {
      state: "closed",
    });
    expect(api.request).toHaveBeenCalledWith("PATCH", "/issues/5", {
      milestone: 13,
    });
    expect(api.request).toHaveBeenCalledWith("PATCH", "/issues/6", {
      milestone: 12,
    });
    expect(
      api.request.mock.calls.filter(
        ([method, path]) => method === "PATCH" && path === "/issues/7",
      ),
    ).toEqual([]);
  });

  it("fetches current server state when an older event is queued", async () => {
    const api = fakeApi();
    api.request.mockResolvedValue(
      issue({
        state: "closed",
        labels: ["needs-triage"],
        milestone: { number: 3 },
      }),
    );
    await runEvent(api, "issues", { issue: { number: 42, state: "open" } });
    expect(api.request).toHaveBeenCalledWith("PATCH", "/issues/42", {
      labels: [],
    });
  });

  it("synchronizes a bot-published tag directly after release publication", async () => {
    const api = fakeApi([
      { title: "v0.1.12", number: 12, state: "closed" },
      { title: "Unreleased", number: 13, state: "open" },
    ]);
    await runEvent(api, "push", { ref: "refs/heads/main" });
    expect(api.paginate).not.toHaveBeenCalled();
    await runEvent(api, "push", { ref: "refs/tags/v0.1.12" });
    expect(api.paginate).toHaveBeenCalledWith(
      "/issues?state=closed&milestone=13",
    );
    const installerWorkflow = parse(
      readFileSync(
        new URL("../.github/workflows/build-installers.yml", import.meta.url),
        "utf8",
      ),
    );
    const steps = installerWorkflow.jobs.package.steps;
    const publishIndex = steps.findIndex(
      (step) => step.name === "Publish release",
    );
    const syncIndex = steps.findIndex(
      (step) => step.name === "Synchronize published release milestone",
    );
    expect(syncIndex).toBeGreaterThan(publishIndex);
    expect(steps[syncIndex].if).toContain("github.event_name == 'push'");
    expect(steps[syncIndex].if).toContain(
      "startsWith(github.ref, 'refs/tags/v')",
    );
    expect(installerWorkflow.jobs.package.permissions).toEqual({
      contents: "write",
      issues: "write",
    });
  });

  it("limits the workflow to metadata writes and trusted default-branch code", () => {
    const workflow = parse(
      readFileSync(
        new URL("../.github/workflows/issue-metadata.yml", import.meta.url),
        "utf8",
      ),
    );
    expect(workflow.permissions).toEqual({ contents: "read", issues: "write" });
    expect(workflow.on).not.toHaveProperty("push");
    expect(workflow.on.release.types).toEqual(["published"]);
    expect(workflow.jobs.sync.steps[0].with.ref).toBe(
      "${{ github.event.repository.default_branch }}",
    );
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  });
});
