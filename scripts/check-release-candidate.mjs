import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateVersions } from "./check-version.mjs";

const workflowPath = ".github/workflows/build-installers.yml";
const requiredJobs = new Map([
  ["Validate release metadata", "Verify version consistency"],
  ["Verify release candidate", "Verify Rust"],
  ["Build Windows x86_64", "Smoke install and launch Windows package"],
  ["Build macOS Universal", "Smoke install and launch macOS package"],
  ["Build Linux x86_64", "Smoke install and launch Linux package"],
  ["Assemble installers and checksums", "Verify release bundle"],
]);

export function selectCandidate(runs, sha) {
  if (!Array.isArray(runs)) throw new Error("Invalid workflow runs response");
  const candidate = runs.find(
    (run) =>
      run.head_sha === sha &&
      run.event === "workflow_dispatch" &&
      run.path === workflowPath &&
      run.status === "completed" &&
      run.conclusion === "success",
  );
  if (!candidate) {
    throw new Error(
      `No successful three-platform Build Installers candidate for ${sha}. Run build-installers.yml on the release branch and wait for completion before tagging.`,
    );
  }
  return candidate;
}

export function verifyCandidateJobs(jobs) {
  if (!Array.isArray(jobs)) throw new Error("Invalid candidate jobs response");
  for (const [name, step] of requiredJobs) {
    const job = jobs.find((entry) => entry.name === name);
    if (job?.status !== "completed" || job.conclusion !== "success") {
      throw new Error(`Candidate job did not pass: ${name}`);
    }
    const steps = [step];
    if (name.startsWith("Build ")) steps.push("Run application core tests");
    for (const requiredStep of steps) {
      if (
        !job.steps?.some(
          (entry) =>
            entry.name === requiredStep && entry.conclusion === "success",
        )
      ) {
        throw new Error(
          `Candidate step did not pass: ${name} / ${requiredStep}`,
        );
      }
    }
  }
}

function execute(command, args, root) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function checkReleaseCandidate({
  tag = "",
  root = process.cwd(),
  env = process.env,
  run = (command, args) => execute(command, args, root),
} = {}) {
  if (run("git", ["status", "--porcelain"])) {
    throw new Error("Release checkout has uncommitted or untracked files");
  }
  validateVersions({ root, tag });
  const sha = run("git", ["rev-parse", "HEAD"]);
  const repository =
    env.GITHUB_REPOSITORY ||
    run("gh", [
      "repo",
      "view",
      "--json",
      "nameWithOwner",
      "--jq",
      ".nameWithOwner",
    ]);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("Invalid repository or release commit SHA");
  }
  const response = JSON.parse(
    run("gh", [
      "api",
      "--method",
      "GET",
      `repos/${repository}/actions/workflows/build-installers.yml/runs`,
      "-f",
      "event=workflow_dispatch",
      "-f",
      `head_sha=${sha}`,
      "-f",
      "per_page=100",
    ]),
  );
  const candidate = selectCandidate(response.workflow_runs, sha);
  if (!Number.isSafeInteger(candidate.id) || candidate.id <= 0) {
    throw new Error("Invalid candidate run ID");
  }
  const { jobs } = JSON.parse(
    run("gh", [
      "api",
      `repos/${repository}/actions/runs/${candidate.id}/jobs?per_page=100`,
    ]),
  );
  verifyCandidateJobs(jobs);
  return { sha, repository, runId: candidate.id, url: candidate.html_url };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const result = checkReleaseCandidate({ tag: process.argv[2] ?? "" });
    console.log(`Release candidate verified: ${result.sha}\n${result.url}`);
  } catch (error) {
    // Child-process messages may contain full local paths; keep API failures terse.
    console.error(
      error?.status !== undefined
        ? "GitHub/Git query failed; check authentication, permissions and connectivity. No tag was created."
        : error instanceof Error
          ? error.message
          : "Release candidate validation failed",
    );
    process.exitCode = 1;
  }
}
