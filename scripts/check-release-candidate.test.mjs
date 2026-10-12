import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkReleaseCandidate,
  selectCandidate,
  verifyCandidateJobs,
} from "./check-release-candidate.mjs";

const sha = "a".repeat(40);
const candidate = {
  id: 123,
  head_sha: sha,
  event: "workflow_dispatch",
  path: ".github/workflows/build-installers.yml",
  status: "completed",
  conclusion: "success",
  html_url: "https://github.com/example/project/actions/runs/123",
};
const jobSteps = [
  ["Validate release metadata", "Verify version consistency"],
  ["Verify release candidate", "Verify Rust"],
  ["Build Windows x86_64", "Smoke install and launch Windows package"],
  ["Build macOS Universal", "Smoke install and launch macOS package"],
  ["Build Linux x86_64", "Smoke install and launch Linux package"],
  ["Assemble installers and checksums", "Verify release bundle"],
];
const jobs = () =>
  jobSteps.map(([name, step]) => ({
    name,
    status: "completed",
    conclusion: "success",
    steps: [step, "Run application core tests"].map((name) => ({
      name,
      conclusion: "success",
    })),
  }));
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agent-hub-candidate-"));
  roots.push(root);
  for (const path of [
    "VERSION",
    "package.json",
    "package-lock.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
  ]) {
    cpSync(new URL(`../${path}`, import.meta.url), join(root, path), {
      recursive: true,
    });
  }
  return root;
}

describe("release candidate gate", () => {
  it("accepts a completed installer candidate for the exact release SHA", () => {
    expect(selectCandidate([candidate], sha)).toEqual(candidate);
    expect(() => verifyCandidateJobs(jobs())).not.toThrow();
  });

  it.each([
    { head_sha: "b".repeat(40) },
    { event: "push" },
    { path: ".github/workflows/ci.yml" },
    { status: "in_progress" },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
  ])("rejects unsuitable candidate evidence %j", (change) => {
    expect(() => selectCandidate([{ ...candidate, ...change }], sha)).toThrow(
      "No successful three-platform",
    );
  });

  it("rejects a missing native platform job", () => {
    expect(() =>
      verifyCandidateJobs(
        jobs().filter((job) => !job.name.includes("Windows")),
      ),
    ).toThrow("Build Windows x86_64");
  });

  it("rejects skipped native tests even when the job reports success", () => {
    const evidence = jobs();
    evidence[2].steps[1].conclusion = "skipped";
    expect(() => verifyCandidateJobs(evidence)).toThrow(
      "Run application core tests",
    );
  });

  it("rejects an unverified release bundle", () => {
    const evidence = jobs();
    evidence[5].steps[0].conclusion = "failure";
    expect(() => verifyCandidateJobs(evidence)).toThrow(
      "Verify release bundle",
    );
  });

  it("rejects local changes before querying GitHub", () => {
    const run = vi.fn(() => "?? src-tauri/src/core/new-module.rs");
    expect(() => checkReleaseCandidate({ run })).toThrow(
      "uncommitted or untracked",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("queries the installer workflow and native jobs without mutating refs", () => {
    const run = vi.fn((command, args) => {
      if (command === "git") return args[0] === "status" ? "" : sha;
      return JSON.stringify(
        args.includes("GET")
          ? { workflow_runs: [candidate] }
          : { jobs: jobs() },
      );
    });
    expect(
      checkReleaseCandidate({
        root: fixture(),
        env: { GITHUB_REPOSITORY: "example/project" },
        run,
      }),
    ).toMatchObject({ sha, runId: 123 });
    expect(run.mock.calls[2][1]).toContain(`head_sha=${sha}`);
    expect(run.mock.calls[2][1]).toContain(
      "repos/example/project/actions/workflows/build-installers.yml/runs",
    );
    expect(run.mock.calls[3][1]).toContain(
      "repos/example/project/actions/runs/123/jobs?per_page=100",
    );
  });

  it("propagates API errors without treating them as absent candidates", () => {
    const run = (command, args) => {
      if (command === "git") return args[0] === "status" ? "" : sha;
      throw new Error("API unavailable");
    };
    expect(() =>
      checkReleaseCandidate({
        root: fixture(),
        env: { GITHUB_REPOSITORY: "example/project" },
        run,
      }),
    ).toThrow("API unavailable");
  });
});
